/**
 * RegLayer — Accessibility Intelligence Score API
 *
 * WHY: The flat 0–100 score gives no actionable insight. AIS provides a multi-dimensional
 *      composite (0–850) that maps violations to human populations, legal risk, and improvement velocity.
 *
 * WHAT:
 *   GET /api/score?scanId=xxx — Compute AIS for a specific scan
 *   GET /api/score?scanId=xxx&history=true — Include historical context for velocity dimension
 *
 * HOW: Fetches scan + violations from DB, collects optional historical scores,
 *      delegates to ais-engine.ts for pure computation.
 *
 * Auth: Requires an authenticated session that owns the scan (cross-tenant
 *       reads of another workspace's scan were possible while this was public).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { assertScanAccess } from "@/lib/auth/access";
import { calculateAIS } from "@/lib/intelligence/ais-engine";
import type { AccessibilityViolation, ScanSummary } from "@/lib/types";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const scanId = searchParams.get("scanId");
  const includeHistory = searchParams.get("history") === "true";

  if (!scanId) {
    return NextResponse.json({ error: "scanId query parameter is required" }, { status: 400 });
  }

  // Ownership check — the caller must own the scan being scored.
  const access = await assertScanAccess(scanId, session);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  // Fetch scan with violations
  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    include: {
      violations: true,
    },
  });

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  if (scan.status !== "COMPLETED") {
    return NextResponse.json({ error: "Scan not yet completed" }, { status: 422 });
  }

  // Map DB violations to domain type
  const violations: AccessibilityViolation[] = scan.violations.map((v) => ({
    id: v.ruleId,
    impact: v.impact as AccessibilityViolation["impact"],
    description: v.description,
    help: v.help ?? v.description,
    helpUrl: v.helpUrl ?? "",
    wcagTags: v.tags ?? [],
    nodes: (v.affectedElements as Array<{ html: string; target: string[]; failureSummary: string }>) ?? [],
  }));

  const summary: ScanSummary = {
    totalViolations: violations.length,
    critical: violations.filter((v) => v.impact === "critical").length,
    serious: violations.filter((v) => v.impact === "serious").length,
    moderate: violations.filter((v) => v.impact === "moderate").length,
    minor: violations.filter((v) => v.impact === "minor").length,
    score: scan.score ?? 0,
  };

  // Tenant scope for history/aggregation — never aggregate across the bare URL
  // (which would mix in other tenants' scans of the same site). Scope to the
  // owning workspace, or to the owning user for legacy workspace-less scans.
  const tenantScope = scan.workspaceId
    ? { workspaceId: scan.workspaceId }
    : { userId: scan.userId };

  // Optional: fetch historical scores for velocity dimension
  let historicalScores: Array<{ score: number; date: string }> | undefined;

  if (includeHistory && scan.url) {
    const historicalScans = await prisma.scan.findMany({
      where: {
        ...tenantScope,
        url: scan.url,
        status: "COMPLETED",
        createdAt: { lt: scan.createdAt },
      },
      select: { score: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    if (historicalScans.length > 0) {
      historicalScores = historicalScans.map((s) => ({
        score: s.score ?? 0,
        date: s.createdAt.toISOString(),
      }));
      // Add current scan to history
      historicalScores.unshift({ score: scan.score ?? 0, date: scan.createdAt.toISOString() });
    }
  }

  // Count pages scanned for this URL (structural depth context), scoped to the
  // owning tenant so the count never leaks other workspaces' scan activity.
  const pagesScanned = await prisma.scan.count({
    where: { ...tenantScope, url: scan.url, status: "COMPLETED" },
  });

  // Calculate AIS
  const ais = calculateAIS({
    violations,
    summary,
    historicalScores,
    pagesScanned: Math.max(pagesScanned, 1),
  });

  return NextResponse.json({
    scanId: scan.id,
    url: scan.url,
    scannedAt: scan.createdAt.toISOString(),
    ais,
  });
}
