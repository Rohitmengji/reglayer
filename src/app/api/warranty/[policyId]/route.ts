/**
 * RegLayer — Warranty Policy Detail API
 *
 * GET    /api/warranty/[policyId] — Get warranty status + eligibility
 * PATCH  /api/warranty/[policyId] — Cancel a warranty
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { getWarrantyStatus } from "@/lib/warranty/loader";

export const dynamic = "force-dynamic";

/**
 * GET /api/warranty/[policyId] — Full warranty status with live eligibility check
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ policyId: string }> }
) {
  const { policyId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership
  const member = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
    select: { workspace: { select: { id: true } } },
  });
  if (!member) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const result = await getWarrantyStatus(policyId);
  if (!result) {
    return NextResponse.json({ error: "Warranty policy not found" }, { status: 404 });
  }

  // IDOR check: policy must belong to the caller's workspace
  if (result.policy.workspaceId !== member.workspace.id) {
    return NextResponse.json({ error: "Warranty policy not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}

/**
 * PATCH /api/warranty/[policyId] — Cancel a warranty policy
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ policyId: string }> }
) {
  const { policyId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
    include: { workspace: true },
  });
  if (!member || !["OWNER", "ADMIN"].includes(member.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  let body: { action?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action !== "cancel") {
    return NextResponse.json({ error: "Only action: 'cancel' is supported" }, { status: 400 });
  }

  const policy = await prisma.warrantyPolicy.findFirst({
    where: { id: policyId, workspaceId: member.workspace.id },
  });
  if (!policy) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  if (policy.status === "CANCELLED") {
    return NextResponse.json({ error: "Policy is already cancelled" }, { status: 409 });
  }

  await prisma.warrantyPolicy.update({
    where: { id: policyId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      action: "warranty.cancelled",
      target: policyId,
      workspaceId: member.workspace.id,
      metadata: { cancelledBy: session.user.email, previousStatus: policy.status },
    },
  });

  return NextResponse.json({ message: "Warranty policy cancelled" });
}
