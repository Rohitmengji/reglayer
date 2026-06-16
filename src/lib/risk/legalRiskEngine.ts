/**
 * RegLayer — Litigation Risk Score Engine
 *
 * WHY: Companies need to understand lawsuit probability, not just WCAG scores.
 * WHAT: Calculates litigation risk based on violation profile, industry, and geography.
 * HOW: Weighted scoring model using publicly available ADA/EAA lawsuit filing data.
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import type { RiskTier } from "@/generated/prisma/client";
import {
  LITIGATION_WEIGHTS,
  INDUSTRY_MULTIPLIERS,
  GEO_MULTIPLIERS,
  IMPACT_MULTIPLIERS,
  type LitigationWeightData,
} from "./litigationWeights";

// Re-export the pure constants so existing importers of legalRiskEngine keep
// working unchanged (the source of truth now lives in ./litigationWeights).
export { LITIGATION_WEIGHTS, INDUSTRY_MULTIPLIERS, GEO_MULTIPLIERS };
export type { LitigationWeightData };

export type RiskContext = {
  industry: string;
  primaryGeo: string;
};

export interface RiskTrendPoint {
  date: Date;
  score: number;
  tier: RiskTier;
  estimatedExposure: number;
}

interface ViolationBreakdownItem {
  ruleId: string;
  count: number;
  weight: number;
  contribution: number;
  avgSettlement: number;
}

/**
 * Calculates litigation risk score for a completed scan.
 * @param scanId - completed scan ID
 * @param context - industry and geography context
 * @returns Persisted LitigationRiskScore
 */
export async function calculateLitigationRisk(
  scanId: string,
  context: RiskContext
) {
  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    include: {
      violations: { select: { ruleId: true, impact: true } },
      site: { select: { id: true } },
    },
  });

  if (!scan || !scan.site) {
    throw new Error(`Scan ${scanId} not found or has no site`);
  }

  // Get weights from DB (fall back to constants if not seeded)
  const dbWeights = await prisma.litigationWeight.findMany();
  const weights: Record<string, LitigationWeightData> = {};
  if (dbWeights.length > 0) {
    for (const w of dbWeights) {
      weights[w.ruleId] = { weight: w.weight, frequency: w.frequency, avgSettlement: w.avgSettlement };
    }
  } else {
    Object.assign(weights, LITIGATION_WEIGHTS);
  }

  // Calculate base score
  const violationsByRule: Record<string, { count: number; impacts: string[] }> = {};
  for (const v of scan.violations) {
    if (!violationsByRule[v.ruleId]) {
      violationsByRule[v.ruleId] = { count: 0, impacts: [] };
    }
    violationsByRule[v.ruleId].count++;
    violationsByRule[v.ruleId].impacts.push(v.impact);
  }

  let rawScore = 0;
  const breakdown: ViolationBreakdownItem[] = [];
  let totalExposure = 0;

  for (const [ruleId, data] of Object.entries(violationsByRule)) {
    const w = weights[ruleId];
    if (!w) continue;

    // Average impact multiplier for this rule
    const avgImpact = data.impacts.reduce((sum, imp) => sum + (IMPACT_MULTIPLIERS[imp] || 1.0), 0) / data.impacts.length;
    const contribution = data.count * w.weight * avgImpact;
    rawScore += contribution;

    const ruleExposure = data.count * w.avgSettlement * 0.15;
    totalExposure += ruleExposure;

    breakdown.push({
      ruleId,
      count: data.count,
      weight: w.weight,
      contribution,
      avgSettlement: w.avgSettlement,
    });
  }

  // Normalize to 0-100
  const maxPossibleRaw = 50; // approximate ceiling for normalization
  const baseScore = Math.min((rawScore / maxPossibleRaw) * 100, 100);

  // Apply multipliers
  const industryMult = INDUSTRY_MULTIPLIERS[context.industry] ?? INDUSTRY_MULTIPLIERS.other;
  const geoMult = GEO_MULTIPLIERS[context.primaryGeo] ?? GEO_MULTIPLIERS.other;

  // Recency factor: scans older than 90 days increase risk by 1.2x
  const daysSinceScan = scan.completedAt
    ? (Date.now() - scan.completedAt.getTime()) / (1000 * 60 * 60 * 24)
    : 0;
  const recencyFactor = daysSinceScan > 90 ? 1.2 : 1.0;

  const finalScore = Math.min(baseScore * industryMult * geoMult * recencyFactor, 100);
  const estimatedExposure = Math.min(totalExposure * industryMult * geoMult, 500000);

  // Determine tier
  const tier: RiskTier = finalScore < 25
    ? "LOW"
    : finalScore < 50
      ? "MODERATE"
      : finalScore < 75
        ? "HIGH"
        : "CRITICAL";

  // Top 3 risk factors
  const sortedBreakdown = [...breakdown].sort((a, b) => b.contribution - a.contribution);
  const topRiskFactors = sortedBreakdown.slice(0, 3).map((item) => ({
    ruleId: item.ruleId,
    count: item.count,
    contribution: Math.round(item.contribution * 100) / 100,
    reason: `${item.count} violation(s) of "${item.ruleId}" — appears in ${Math.round((weights[item.ruleId]?.frequency ?? 0) * 100)}% of lawsuits`,
  }));

  // Generate narrative
  const narrative = generateRiskNarrativeSync(
    { baseScore, finalScore, tier, estimatedExposure, industry: context.industry, primaryGeo: context.primaryGeo },
    topRiskFactors,
    scan.violations.length
  );

  // Upsert (in case of recalculation)
  const riskScore = await prisma.litigationRiskScore.upsert({
    where: { scanId },
    create: {
      siteId: scan.site.id,
      scanId,
      baseScore: Math.round(baseScore * 100) / 100,
      finalScore: Math.round(finalScore * 100) / 100,
      tier,
      industry: context.industry,
      primaryGeo: context.primaryGeo,
      industryMultiplier: industryMult,
      geoMultiplier: geoMult,
      estimatedExposure: Math.round(estimatedExposure),
      violationBreakdown: JSON.parse(JSON.stringify(breakdown)),
      topRiskFactors: JSON.parse(JSON.stringify(topRiskFactors)),
      narrative,
    },
    update: {
      baseScore: Math.round(baseScore * 100) / 100,
      finalScore: Math.round(finalScore * 100) / 100,
      tier,
      industry: context.industry,
      primaryGeo: context.primaryGeo,
      industryMultiplier: industryMult,
      geoMultiplier: geoMult,
      estimatedExposure: Math.round(estimatedExposure),
      violationBreakdown: JSON.parse(JSON.stringify(breakdown)),
      topRiskFactors: JSON.parse(JSON.stringify(topRiskFactors)),
      narrative,
    },
  });

  return riskScore;
}

/**
 * Returns risk score trend over time for a site.
 * @param siteId - the site to get trends for
 * @param options - optional date range filter
 * @returns Array of trend points
 */
export async function getRiskTrend(
  siteId: string,
  options?: { from?: Date; to?: Date }
): Promise<RiskTrendPoint[]> {
  const where: Record<string, unknown> = { siteId };
  if (options?.from || options?.to) {
    where.calculatedAt = {};
    if (options.from) (where.calculatedAt as Record<string, unknown>).gte = options.from;
    if (options.to) (where.calculatedAt as Record<string, unknown>).lte = options.to;
  }

  const scores = await prisma.litigationRiskScore.findMany({
    where,
    select: {
      calculatedAt: true,
      finalScore: true,
      tier: true,
      estimatedExposure: true,
    },
    orderBy: { calculatedAt: "asc" },
    take: 90,
  });

  return scores.map((s) => ({
    date: s.calculatedAt,
    score: s.finalScore,
    tier: s.tier,
    estimatedExposure: s.estimatedExposure,
  }));
}

/**
 * Generates a plain-English risk narrative (no AI call — deterministic).
 */
function generateRiskNarrativeSync(
  score: { baseScore: number; finalScore: number; tier: string; estimatedExposure: number; industry: string; primaryGeo: string },
  topFactors: Array<{ ruleId: string; count: number; reason: string }>,
  totalViolations: number
): string {
  const tierDescriptions: Record<string, string> = {
    LOW: "minimal legal exposure",
    MODERATE: "moderate legal risk that warrants attention",
    HIGH: "significant legal exposure requiring immediate action",
    CRITICAL: "severe litigation risk demanding urgent remediation",
  };

  const tierDesc = tierDescriptions[score.tier] || "notable legal exposure";
  const topFactor = topFactors[0];

  let narrative = `Your site has ${totalViolations} accessibility violation(s), indicating ${tierDesc}. `;

  if (topFactor) {
    narrative += `The primary risk driver is "${topFactor.ruleId}" with ${topFactor.count} instance(s) — ${topFactor.reason}. `;
  }

  narrative += `Combined with your ${score.industry} industry profile and ${score.primaryGeo} user base, `;
  narrative += `your estimated legal exposure is $${score.estimatedExposure.toLocaleString()}.`;

  return narrative;
}
