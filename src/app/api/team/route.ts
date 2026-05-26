import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import bcrypt from "bcryptjs";

/**
 * GET /api/team — List team members in the current workspace
 * POST /api/team — Invite a new member
 * PATCH /api/team — Update member role
 * DELETE /api/team — Remove a member
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      memberships: {
        include: {
          workspace: {
            include: {
              members: {
                include: { user: { select: { id: true, name: true, email: true, plan: true, isMasterAdmin: true } } },
                orderBy: { joinedAt: "asc" },
              },
            },
          },
        },
      },
    },
  });

  if (!user || user.memberships.length === 0) {
    return NextResponse.json({ members: [], workspace: null });
  }

  const membership = user.memberships[0];
  const workspace = membership.workspace;

  return NextResponse.json({
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      plan: workspace.plan,
    },
    currentUserRole: membership.role,
    members: workspace.members.map((m) => ({
      id: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      plan: m.user.plan,
      isMasterAdmin: m.user.isMasterAdmin || false,
      joinedAt: m.joinedAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { email, role = "MEMBER" } = body;

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Verify current user is OWNER or ADMIN
  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { memberships: true },
  });

  if (!currentUser || currentUser.memberships.length === 0) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const membership = currentUser.memberships[0];
  if (!["OWNER", "ADMIN"].includes(membership.role)) {
    return NextResponse.json({ error: "Only owners and admins can invite members" }, { status: 403 });
  }

  // Find or create the invited user
  let invitedUser = await prisma.user.findUnique({ where: { email } });
  if (!invitedUser) {
    invitedUser = await prisma.user.create({
      data: { email, name: email.split("@")[0] },
    });
  }

  // Check if already a member
  const existing = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: invitedUser.id, workspaceId: membership.workspaceId } },
  });

  if (existing) {
    return NextResponse.json({ error: "User is already a team member" }, { status: 409 });
  }

  // Validate role
  const validRoles = ["ADMIN", "MEMBER", "VIEWER"];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const newMember = await prisma.workspaceMember.create({
    data: {
      userId: invitedUser.id,
      workspaceId: membership.workspaceId,
      role,
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json({
    id: newMember.id,
    userId: newMember.user.id,
    name: newMember.user.name,
    email: newMember.user.email,
    role: newMember.role,
    joinedAt: newMember.joinedAt,
  }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { memberId, role, plan } = body;

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { memberships: { include: { workspace: true } } },
  });

  if (!currentUser || currentUser.memberships.length === 0) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const myMembership = currentUser.memberships[0];

  // ── Change user plan ───────────────────────────────────────
  if (plan) {
    const { userId } = body;
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }
    if (!["OWNER", "ADMIN"].includes(myMembership.role)) {
      return NextResponse.json({ error: "Only owners and admins can change user plans" }, { status: 403 });
    }
    const validPlans = ["FREE", "PRO", "ENTERPRISE"];
    if (!validPlans.includes(plan)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }
    // Verify target user is in the same workspace
    const targetMember = await prisma.workspaceMember.findFirst({
      where: { userId, workspaceId: myMembership.workspaceId },
    });
    if (!targetMember) {
      return NextResponse.json({ error: "User is not in your workspace" }, { status: 404 });
    }
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { plan },
    });
    return NextResponse.json({ success: true, userId, plan: updated.plan });
  }

  // ── Change member role ─────────────────────────────────────
  if (!memberId || !role) {
    return NextResponse.json({ error: "memberId and role are required" }, { status: 400 });
  }

  if (!["OWNER", "ADMIN"].includes(myMembership.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  // Can't change owner role
  const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } });
  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  if (target.role === "OWNER") {
    return NextResponse.json({ error: "Cannot change owner role" }, { status: 403 });
  }

  const updated = await prisma.workspaceMember.update({
    where: { id: memberId },
    data: { role },
  });

  return NextResponse.json({ id: updated.id, role: updated.role });
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const memberId = searchParams.get("id");

  if (!memberId) {
    return NextResponse.json({ error: "Member ID required" }, { status: 400 });
  }

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { memberships: true },
  });

  if (!currentUser || currentUser.memberships.length === 0) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const myMembership = currentUser.memberships[0];
  if (!["OWNER", "ADMIN"].includes(myMembership.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } });
  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  if (target.role === "OWNER") {
    return NextResponse.json({ error: "Cannot remove workspace owner" }, { status: 403 });
  }

  await prisma.workspaceMember.delete({ where: { id: memberId } });

  return NextResponse.json({ success: true });
}

/**
 * PUT /api/team — Reset password for a workspace member (OWNER/ADMIN only)
 */
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { userId, newPassword } = body;

  if (!userId || !newPassword) {
    return NextResponse.json({ error: "userId and newPassword are required" }, { status: 400 });
  }

  if (newPassword.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { memberships: true },
  });

  if (!currentUser || currentUser.memberships.length === 0) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const myMembership = currentUser.memberships[0];
  if (!["OWNER", "ADMIN"].includes(myMembership.role)) {
    return NextResponse.json({ error: "Only owners and admins can reset passwords" }, { status: 403 });
  }

  // Verify target user is in the same workspace
  const targetMember = await prisma.workspaceMember.findFirst({
    where: { userId, workspaceId: myMembership.workspaceId },
  });

  if (!targetMember) {
    return NextResponse.json({ error: "User is not in your workspace" }, { status: 404 });
  }

  // Cannot reset password for owners or higher-role users
  if (targetMember.role === "OWNER") {
    return NextResponse.json({ error: "Cannot reset owner's password" }, { status: 403 });
  }

  // Admin cannot reset another admin's password
  if (myMembership.role === "ADMIN" && targetMember.role === "ADMIN") {
    return NextResponse.json({ error: "Cannot reset password for users with equal role" }, { status: 403 });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashedPassword },
  });

  return NextResponse.json({ success: true });
}
