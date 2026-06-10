/**
 * GET /api/onboarding/status
 * Returns boolean flags for each onboarding step.
 * Used by the floating checklist widget.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Get user's workspace via membership
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    select: { workspaceId: true },
  });

  const workspaceId = membership?.workspaceId;

  // Check each onboarding step in parallel
  const [siteCount, scanCount, teamCount, integrationCount] = await Promise.all([
    workspaceId ? prisma.site.count({ where: { workspaceId } }) : Promise.resolve(0),
    prisma.scan.count({ where: { userId: user.id } }),
    workspaceId
      ? prisma.workspaceMember.count({ where: { workspaceId } })
      : Promise.resolve(0),
    prisma.integration.count({ where: { userId: user.id } }).catch(() => 0),
  ]);

  return NextResponse.json({
    hasSite: siteCount > 0,
    hasScan: scanCount > 0,
    hasTeammate: teamCount > 1, // More than just the owner
    hasIntegration: integrationCount > 0,
    hasFixed: false, // TODO: track when user fixes first issue
  });
}
