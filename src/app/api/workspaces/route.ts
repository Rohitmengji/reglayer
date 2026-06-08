/**
 * RegLayer — Workspace Switching API
 *
 * GET /api/workspaces — List all workspaces user belongs to
 * POST /api/workspaces/switch — Switch active workspace (stored in session/cookie)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";

/**
 * GET — List all workspaces the user belongs to with role and plan.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      memberships: {
        include: {
          workspace: {
            select: {
              id: true,
              name: true,
              slug: true,
              plan: true,
              _count: { select: { members: true, scans: true } },
            },
          },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const workspaces = user.memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    plan: m.workspace.plan,
    role: m.role,
    memberCount: m.workspace._count.members,
    scanCount: m.workspace._count.scans,
  }));

  return NextResponse.json({ workspaces });
}

/**
 * POST — Switch active workspace. Sets a cookie for subsequent requests.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId } = await request.json();
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }

  // Verify user has membership in this workspace
  const membership = await prisma.workspaceMember.findFirst({
    where: {
      workspace: { id: workspaceId },
      user: { email: session.user.email },
    },
    select: { workspaceId: true, role: true },
  });

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
  }

  // Set workspace cookie
  const response = NextResponse.json({ success: true, workspaceId, role: membership.role });
  response.cookies.set("reglayer-workspace", workspaceId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  return response;
}
