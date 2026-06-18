/**
 * GET /api/onboarding/status
 * Returns boolean flags for each onboarding step + user's persona/dismissed state.
 * Used by the floating checklist widget and role onboarding overlay.
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
    select: { id: true, persona: true, onboardingDismissed: true, createdAt: true },
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
  const [siteCount, scanCount, teamCount, integrationCount, firstFixed] = await Promise.all([
    workspaceId ? prisma.site.count({ where: { workspaceId } }) : Promise.resolve(0),
    prisma.scan.count({ where: { userId: user.id } }),
    workspaceId
      ? prisma.workspaceMember.count({ where: { workspaceId } })
      : Promise.resolve(0),
    prisma.integration.count({ where: { userId: user.id } }).catch(() => 0),
    prisma.violation.findFirst({
      where: { scan: { userId: user.id }, status: { in: ["FIXED", "VERIFIED"] } },
      select: { id: true },
    }).catch(() => null),
  ]);

  return NextResponse.json({
    // Onboarding visibility state (server-authoritative)
    persona: user.persona,
    onboardingDismissed: user.onboardingDismissed,
    totalScans: scanCount,
    // Task completion flags
    hasSite: siteCount > 0,
    hasScan: scanCount > 0,
    hasTeammate: teamCount > 1,
    hasIntegration: integrationCount > 0,
    hasFixed: !!firstFixed,
  });
}
