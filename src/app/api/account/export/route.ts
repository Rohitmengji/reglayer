/**
 * RegLayer — GDPR Data Export API
 *
 * GET /api/account/export → Returns all user data as JSON (GDPR Article 20 - Right to Data Portability)
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";

/**
 * GET /api/account/export — Export all user data as JSON.
 * GDPR Article 20 — Right to Data Portability.
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
      email: true,
      name: true,
      image: true,
      plan: true,
      createdAt: true,
      updatedAt: true,
      aiCreditsUsed: true,
      bonusCredits: true,
      creditResetAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Gather all user data
  const [scans, violations, apiKeys, memberships, creditGrants] = await Promise.all([
    prisma.scan.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.violation.findMany({
      where: { scan: { userId: user.id } },
      select: {
        id: true,
        ruleId: true,
        impact: true,
        description: true,
        status: true,
        affectedElements: true,
        wcagCriteria: true,
        scanId: true,
      },
    }),
    prisma.apiKey.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        prefix: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
    }),
    prisma.workspaceMember.findMany({
      where: { userId: user.id },
      include: {
        workspace: {
          select: { id: true, name: true, createdAt: true },
        },
      },
    }),
    prisma.creditGrant.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        amount: true,
        reason: true,
        createdAt: true,
      },
    }),
  ]);

  // Group violations by scan
  const violationsByScan = violations.reduce<Record<string, typeof violations>>((acc, v) => {
    if (!acc[v.scanId]) acc[v.scanId] = [];
    acc[v.scanId].push(v);
    return acc;
  }, {});

  const exportData = {
    exportDate: new Date().toISOString(),
    format: "GDPR_DATA_EXPORT_V1",
    user: {
      ...user,
      passwordHash: "[REDACTED]",
    },
    scans: scans.map((scan) => ({
      id: scan.id,
      url: scan.url,
      score: scan.score,
      totalViolations: scan.totalViolations,
      status: scan.status,
      createdAt: scan.createdAt,
      completedAt: scan.completedAt,
      violations: violationsByScan[scan.id] || [],
    })),
    apiKeys,
    workspaces: memberships.map((m) => ({
      workspace: m.workspace,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
    creditGrants,
    metadata: {
      totalScans: scans.length,
      totalViolationsTracked: violations.length,
      accountAge: Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)) + " days",
    },
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="reglayer-data-export-${user.id}.json"`,
    },
  });
}
