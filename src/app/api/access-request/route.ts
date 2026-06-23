/**
 * /api/access-request — Access Request API
 *
 * POST — Submit a new access request (authenticated user with no workspace)
 * GET  — List pending requests (master admin / workspace owners)
 * PATCH — Approve or deny a request (master admin / workspace owners)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { applyRateLimit } from "@/lib/rate-limit-middleware";

// POST — User submits an access request
export async function POST(req: NextRequest) {
  const blocked = await applyRateLimit(req, "auth");
  if (blocked) return blocked;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { memberships: { select: { id: true } } },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Don't allow request if already has a workspace
  if (user.memberships.length > 0) {
    return NextResponse.json({ error: "You already have workspace access" }, { status: 400 });
  }

  // Check for existing pending request
  const existing = await prisma.accessRequest.findFirst({
    where: { userId: user.id, status: "PENDING" },
  });
  if (existing) {
    return NextResponse.json({ error: "You already have a pending request", request: existing }, { status: 400 });
  }

  const body = await req.json();
  const { message, workspaceId } = body;

  const request = await prisma.accessRequest.create({
    data: {
      userId: user.id,
      message: message || null,
      workspaceId: workspaceId || null,
    },
  });

  return NextResponse.json({ success: true, request });
}

// GET — List access requests (master admin sees all, workspace owners see theirs)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, isMasterAdmin: true, memberships: { select: { workspaceId: true, role: true } } },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Regular user with no workspace: return their own request status
  if (!user.isMasterAdmin && user.memberships.length === 0) {
    const myRequest = await prisma.accessRequest.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ myRequest: myRequest || null, requests: [] });
  }

  // Master admin sees all requests
  if (user.isMasterAdmin) {
    const requests = await prisma.accessRequest.findMany({
      where: { status: "PENDING" },
      include: { user: { select: { id: true, email: true, name: true, image: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ requests });
  }

  // Workspace owners see requests targeted at their workspace
  const ownedWorkspaceIds = user.memberships
    .filter((m) => m.role === "OWNER" || m.role === "ADMIN")
    .map((m) => m.workspaceId);

  if (ownedWorkspaceIds.length === 0) {
    return NextResponse.json({ requests: [] });
  }

  const requests = await prisma.accessRequest.findMany({
    where: {
      status: "PENDING",
      workspaceId: { in: ownedWorkspaceIds },
    },
    include: { user: { select: { id: true, email: true, name: true, image: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ requests });
}

// PATCH — Approve or deny a request
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, isMasterAdmin: true, memberships: { select: { workspaceId: true, role: true } } },
  });

  if (!actor) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await req.json();
  const { requestId, action, workspaceId, role } = body;

  if (!requestId || !["approve", "deny"].includes(action)) {
    return NextResponse.json({ error: "Missing requestId or invalid action" }, { status: 400 });
  }

  const accessRequest = await prisma.accessRequest.findUnique({
    where: { id: requestId },
    include: { user: true },
  });

  if (!accessRequest || accessRequest.status !== "PENDING") {
    return NextResponse.json({ error: "Request not found or already resolved" }, { status: 404 });
  }

  // Permission check: master admin, OR owner/admin of the workspace the REQUEST
  // targets. Authority derives from the STORED request, never the body — otherwise
  // an owner of workspace A could act on (or redirect) a request targeted at B by
  // passing their own workspaceId. Globally-pending requests (no target) are
  // master-admin only.
  if (!actor.isMasterAdmin) {
    if (!accessRequest.workspaceId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const hasPermission = actor.memberships.some(
      (m) => m.workspaceId === accessRequest.workspaceId && (m.role === "OWNER" || m.role === "ADMIN")
    );
    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (action === "deny") {
    await prisma.accessRequest.update({
      where: { id: requestId },
      data: { status: "DENIED", resolvedBy: actor.id, resolvedAt: new Date() },
    });
    return NextResponse.json({ success: true, status: "DENIED" });
  }

  // Approve: add the user to the workspace. Non-master actors can only approve
  // INTO the request's targeted workspace (the one they were just verified to own);
  // only a master admin may direct an approval to an arbitrary workspaceId.
  const targetWorkspaceId = actor.isMasterAdmin
    ? (workspaceId || accessRequest.workspaceId)
    : accessRequest.workspaceId;
  if (!targetWorkspaceId) {
    return NextResponse.json({ error: "Must specify workspaceId to approve" }, { status: 400 });
  }

  // OWNER is never assignable via access-request approval (prevents an admin from
  // minting a co-owner). Reject anything outside the safe set instead of 500ing
  // on an invalid enum at create time.
  const assignRole = role || "MEMBER";
  if (!["ADMIN", "MEMBER", "VIEWER"].includes(assignRole)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Check workspace exists
  const workspace = await prisma.workspace.findUnique({ where: { id: targetWorkspaceId } });
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Add user to workspace
  await prisma.workspaceMember.create({
    data: {
      userId: accessRequest.userId,
      workspaceId: targetWorkspaceId,
      role: assignRole,
    },
  });

  // Google/OAuth users should remain on FREE plan after access approval.
  // Credits and AI limits are enforced from user.plan, not workspace.plan.
  if (!accessRequest.user.passwordHash) {
    await prisma.user.update({
      where: { id: accessRequest.userId },
      data: { plan: "FREE" },
    });
  }

  // Mark request as approved
  await prisma.accessRequest.update({
    where: { id: requestId },
    data: { status: "APPROVED", resolvedBy: actor.id, resolvedAt: new Date(), workspaceId: targetWorkspaceId },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      action: "accessRequest.approved",
      actor: actor.id,
      target: accessRequest.userId,
      metadata: {
        email: accessRequest.user.email,
        role: assignRole,
        workspaceId: targetWorkspaceId,
        enforcedFreePlan: !accessRequest.user.passwordHash,
      },
      workspaceId: targetWorkspaceId,
    },
  });

  return NextResponse.json({ success: true, status: "APPROVED" });
}
