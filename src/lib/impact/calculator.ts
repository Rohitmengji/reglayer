/**
 * ---------------------------------------------------------
 * RegLayer — Impact Calculator (pure core)
 * ---------------------------------------------------------
 *
 * WHY: Quantifies accessibility work in BUSINESS terms — users unblocked,
 *      revenue enabled, risk reduced. Answers "what did our investment achieve?"
 *
 * WHAT: Pure functions that compute impact metrics from before/after scan data,
 *       traffic estimates, and disability prevalence. No Prisma, no Next.
 *
 * HOW: Uses WHO disability prevalence data (15-20% globally), site traffic,
 *      conversion rates, and violation-to-barrier mapping to estimate the
 *      population that was blocked before remediation and is now unblocked.
 *
 * METHODOLOGY (transparent, auditable):
 *   usersUnblocked = monthlyTraffic × disabilityPrevalence × accessibilityGain
 *   revenueEnabled = usersUnblocked × conversionRate × avgOrderValue
 *   riskReduced = riskExposureBefore - riskExposureAfter
 *   accessibilityGain = (violationsFixed / violationsBefore) × (scoreGain / 100)
 * ---------------------------------------------------------
 */

import crypto from "crypto";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ImpactInput {
  // Before state
  scoreBefore: number;
  violationsBefore: number;
  riskExposureBefore: number;    // USD cents
  personasPassingBefore: number; // 0-5

  // After state
  scoreAfter: number;
  violationsAfter: number;
  riskExposureAfter: number;     // USD cents
  personasPassingAfter: number;  // 0-5

  // Site context
  monthlyTraffic: number;        // Unique visitors/month
  disabilityPrevalence: number;  // 0-1 (default 0.15 = 15%)
  conversionRate: number | null; // 0-1 (null = use industry avg)
  avgOrderValue: number | null;  // USD cents (null = use industry avg)
  industry: string | null;

  // Evidence
  proofChainLength: number;
  monitoringDays: number;
  scansInPeriod: number;

  // Period
  periodStart: Date;
  periodEnd: Date;
}

export interface ImpactResult {
  usersUnblocked: number;
  revenueEnabled: number;       // USD cents
  riskReduced: number;          // USD cents
  violationsFixed: number;
  scoreImprovement: number;
  industryPercentile: number | null;
  accessibilityGain: number;    // 0-1
  evidenceHash: string;
  methodology: ImpactMethodology;
}

export interface ImpactMethodology {
  formula: string;
  inputs: Record<string, number | string | null>;
  assumptions: string[];
  confidence: "high" | "medium" | "low";
}

// ─── Industry Defaults ───────────────────────────────────────────────────────

const INDUSTRY_CONVERSION_RATES: Record<string, number> = {
  ecommerce: 0.028,
  saas: 0.05,
  fintech: 0.035,
  healthcare: 0.032,
  education: 0.04,
  media: 0.015,
  government: 0.06,
  nonprofit: 0.045,
  other: 0.03,
};

const INDUSTRY_AOV: Record<string, number> = {
  ecommerce: 85_00,      // $85
  saas: 150_00,           // $150/mo
  fintech: 200_00,        // $200
  healthcare: 120_00,     // $120
  education: 75_00,       // $75
  media: 12_00,           // $12
  government: 0,          // N/A
  nonprofit: 45_00,       // $45 donation
  other: 80_00,           // $80
};

// Disability prevalence by type (WHO data, approximate)
const PREVALENCE = {
  total: 0.15,           // 15% global (WHO: 1.3B people, ~16%)
  visual: 0.022,         // 2.2% vision impairment
  hearing: 0.015,        // 1.5% hearing loss
  motor: 0.025,          // 2.5% mobility/dexterity
  cognitive: 0.05,       // 5% cognitive/neurological
  // These overlap — total ≈ 15% accounting for comorbidity
};

// ─── Calculator ──────────────────────────────────────────────────────────────

/**
 * Compute the business impact of accessibility improvements.
 *
 * Conservative methodology: only claims impact proportional to VERIFIED
 * improvements (score gain × violation reduction). Does NOT claim 100%
 * of disabled users were blocked — uses the measured accessibility gain
 * as a scaling factor.
 */
export function calculateImpact(input: ImpactInput): ImpactResult {
  const violationsFixed = Math.max(0, input.violationsBefore - input.violationsAfter);
  const scoreImprovement = Math.max(0, input.scoreAfter - input.scoreBefore);

  // Accessibility gain: composite of score improvement and violation reduction
  // Capped at 1.0 — cannot claim more than 100% improvement
  const violationReduction = input.violationsBefore > 0
    ? violationsFixed / input.violationsBefore
    : 0;
  const scoreGain = scoreImprovement / 100;
  const accessibilityGain = Math.min(1, (violationReduction * 0.6 + scoreGain * 0.4));

  // Users unblocked: of the disabled users visiting, how many are now unblocked?
  const disabledVisitors = Math.round(input.monthlyTraffic * input.disabilityPrevalence);
  const usersUnblocked = Math.round(disabledVisitors * accessibilityGain);

  // Revenue enabled: unblocked users × conversion × AOV
  const conversionRate = input.conversionRate ?? INDUSTRY_CONVERSION_RATES[input.industry ?? "other"] ?? 0.03;
  const aov = input.avgOrderValue ?? INDUSTRY_AOV[input.industry ?? "other"] ?? 80_00;
  const revenueEnabled = Math.round(usersUnblocked * conversionRate * (aov / 100)) * 100; // Round to dollars

  // Risk reduced: delta in litigation exposure
  const riskReduced = Math.max(0, input.riskExposureBefore - input.riskExposureAfter);

  // Industry percentile (null if no industry context)
  const industryPercentile = input.industry
    ? estimatePercentile(input.scoreAfter, input.industry)
    : null;

  // Confidence based on data quality
  const confidence = determineConfidence(input);

  // Evidence hash: SHA-256 over all certificate data for verification
  const evidenceHash = computeEvidenceHash(input, {
    usersUnblocked,
    revenueEnabled,
    riskReduced,
    violationsFixed,
    scoreImprovement,
    accessibilityGain,
  });

  const methodology: ImpactMethodology = {
    formula: "usersUnblocked = monthlyTraffic × disabilityPrevalence × accessibilityGain; revenueEnabled = usersUnblocked × conversionRate × avgOrderValue",
    inputs: {
      monthlyTraffic: input.monthlyTraffic,
      disabilityPrevalence: input.disabilityPrevalence,
      conversionRate,
      avgOrderValue: aov,
      violationReduction: Math.round(violationReduction * 100) / 100,
      scoreGain: Math.round(scoreGain * 100) / 100,
      accessibilityGain: Math.round(accessibilityGain * 100) / 100,
      industry: input.industry,
    },
    assumptions: [
      `Disability prevalence: ${(input.disabilityPrevalence * 100).toFixed(1)}% (WHO global estimate)`,
      `Accessibility gain weighted: 60% violation reduction + 40% score improvement`,
      conversionRate === input.conversionRate
        ? "Conversion rate: user-provided"
        : `Conversion rate: ${(conversionRate * 100).toFixed(1)}% (industry average for ${input.industry || "general"})`,
      aov === input.avgOrderValue
        ? "Average order value: user-provided"
        : `Average order value: $${(aov / 100).toFixed(0)} (industry average)`,
      "Not all disabled users were fully blocked — gain is proportional to measured improvement",
      "Revenue figure represents addressable revenue enabled, not guaranteed conversion",
    ],
    confidence,
  };

  return {
    usersUnblocked,
    revenueEnabled,
    riskReduced,
    violationsFixed,
    scoreImprovement,
    industryPercentile,
    accessibilityGain: Math.round(accessibilityGain * 100) / 100,
    evidenceHash,
    methodology,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function estimatePercentile(score: number, _industry: string): number {
  // Based on WebAIM Million analysis: median score ~30-40 for most industries
  // A score of 90+ puts you in top 5%
  if (score >= 95) return 98;
  if (score >= 90) return 95;
  if (score >= 85) return 90;
  if (score >= 80) return 82;
  if (score >= 75) return 72;
  if (score >= 70) return 60;
  if (score >= 60) return 45;
  if (score >= 50) return 30;
  return Math.max(5, Math.round(score * 0.5));
}

function determineConfidence(input: ImpactInput): "high" | "medium" | "low" {
  let score = 0;
  if (input.monthlyTraffic > 0) score++;               // Has traffic data
  if (input.conversionRate !== null) score++;           // Has conversion data
  if (input.avgOrderValue !== null) score++;            // Has AOV
  if (input.scansInPeriod >= 10) score++;              // Sufficient scan density
  if (input.monitoringDays >= 30) score++;             // Full month monitored
  if (input.proofChainLength >= 5) score++;            // Evidence chain exists
  if (input.violationsBefore >= 10) score++;           // Enough violations for meaningful %

  if (score >= 5) return "high";
  if (score >= 3) return "medium";
  return "low";
}

function computeEvidenceHash(
  input: ImpactInput,
  results: Record<string, number>
): string {
  const canonical = JSON.stringify({
    period: { start: input.periodStart.toISOString(), end: input.periodEnd.toISOString() },
    before: { score: input.scoreBefore, violations: input.violationsBefore, risk: input.riskExposureBefore },
    after: { score: input.scoreAfter, violations: input.violationsAfter, risk: input.riskExposureAfter },
    results,
    evidence: { proofs: input.proofChainLength, days: input.monitoringDays, scans: input.scansInPeriod },
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}
