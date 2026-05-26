import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";

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
                include: { user: { select: { id: true, name: true, email: true, isMasterAdmin: true } } },
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
  const { memberId, role } = body;

  if (!memberId || !role) {
    return NextResponse.json({ error: "memberId and role are required" }, { status: 400 });
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
