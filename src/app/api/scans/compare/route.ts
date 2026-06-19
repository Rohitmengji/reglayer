/**
 * RegLayer — Scan Compare API
 *
 * WHY: Teams need to see what changed between two scans (did we fix/introduce issues?).
 * WHAT: GET with base and head scan IDs, returns diff (fixed, introduced, persistent violations).
 * HOW: Loads both scans' violations and diffs them BY RULE (ruleId). A Violation row
 *      is per-rule (it aggregates all affected elements for that rule on the scan), so
 *      rule-level is the correct comparison granularity here — a rule counts as "fixed"
 *      when it's gone in head, "introduced" when new in head, else "persistent".
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { assertScanAccess } from "@/lib/auth/access";
import { prisma } from "@/lib/database/prisma";
import { scoreFromStoredViolations } from "@/lib/scoring/reportScore";

/**
 * Scan Comparison API
 * 
 * GET /api/scans/compare?base=<scanId>&head=<scanId>
 * 
 * Returns a diff of two scans: what improved, what regressed, what's new.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const baseId = request.nextUrl.searchParams.get("base");
  const headId = request.nextUrl.searchParams.get("head");

  if (!baseId || !headId) {
    return NextResponse.json(
      { error: "Both 'base' and 'head' scan IDs are required" },
      { status: 400 }
    );
  }

  // IDOR guard: the caller must own BOTH scans being compared.
  const [baseAccess, headAccess] = await Promise.all([
    assertScanAccess(baseId, session),
    assertScanAccess(headId, session),
  ]);
  if (!baseAccess.ok) return NextResponse.json({ error: baseAccess.error }, { status: baseAccess.status });
  if (!headAccess.ok) return NextResponse.json({ error: headAccess.error }, { status: headAccess.status });

  const [baseScan, headScan] = await Promise.all([
    prisma.scan.findUnique({ where: { id: baseId }, include: { violations: true } }),
    prisma.scan.findUnique({ where: { id: headId }, include: { violations: true } }),
  ]);

  if (!baseScan || !headScan) {
    return NextResponse.json(
      { error: "One or both scans not found" },
      { status: 404 }
    );
  }

  // Build violation fingerprints for comparison
  const baseViolationMap = new Map(
    baseScan.violations.map((v) => [v.ruleId, v])
  );
  const headViolationMap = new Map(
    headScan.violations.map((v) => [v.ruleId, v])
  );

  const fixed: string[] = [];
  const introduced: string[] = [];
  const persistent: string[] = [];

  for (const ruleId of baseViolationMap.keys()) {
    if (headViolationMap.has(ruleId)) {
      persistent.push(ruleId);
    } else {
      fixed.push(ruleId);
    }
  }

  for (const ruleId of headViolationMap.keys()) {
    if (!baseViolationMap.has(ruleId)) {
      introduced.push(ruleId);
    }
  }

  // Recompute both panels' scores from their violations via the canonical helper,
  // so the Before/After hero numbers and the delta chip always match the score
  // shown on report/[id], the badge, and the certificate for the same scan.
  const baseScore = scoreFromStoredViolations(baseScan.violations);
  const headScore = scoreFromStoredViolations(headScan.violations);
  const scoreDelta = headScore - baseScore;
  const complianceDelta = (headScan.compliance ?? 0) - (baseScan.compliance ?? 0);

  return NextResponse.json({
    comparison: {
      base: {
        id: baseScan.id,
        url: baseScan.url,
        score: baseScore,
        totalViolations: baseScan.totalViolations,
        scannedAt: baseScan.createdAt,
      },
      head: {
        id: headScan.id,
        url: headScan.url,
        score: headScore,
        totalViolations: headScan.totalViolations,
        scannedAt: headScan.createdAt,
      },
      delta: {
        score: scoreDelta,
        compliance: complianceDelta,
        violations: headScan.totalViolations - baseScan.totalViolations,
      },
      regressions: introduced.map((ruleId) => {
        const v = headViolationMap.get(ruleId)!;
        return { ruleId, impact: v.impact, description: v.description, help: v.help };
      }),
      fixes: fixed.map((ruleId) => {
        const v = baseViolationMap.get(ruleId)!;
        return { ruleId, impact: v.impact, description: v.description, help: v.help };
      }),
      persistent: persistent.map((ruleId) => {
        const v = headViolationMap.get(ruleId)!;
        return { ruleId, impact: v.impact, description: v.description };
      }),
      summary: {
        totalFixed: fixed.length,
        totalIntroduced: introduced.length,
        totalPersistent: persistent.length,
        improved: scoreDelta > 0,
        regressed: scoreDelta < 0,
      },
    },
  });
}
