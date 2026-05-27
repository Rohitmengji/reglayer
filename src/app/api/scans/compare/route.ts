import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";

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

  const scoreDelta = (headScan.score ?? 0) - (baseScan.score ?? 0);
  const complianceDelta = (headScan.compliance ?? 0) - (baseScan.compliance ?? 0);

  return NextResponse.json({
    comparison: {
      base: {
        id: baseScan.id,
        url: baseScan.url,
        score: baseScan.score,
        totalViolations: baseScan.totalViolations,
        scannedAt: baseScan.createdAt,
      },
      head: {
        id: headScan.id,
        url: headScan.url,
        score: headScan.score,
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
