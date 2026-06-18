/**
 * ---------------------------------------------------------
 * RegLayer — Revenue Impact Calculator
 * ---------------------------------------------------------
 *
 * Calculates the estimated revenue lost due to accessibility
 * issues. Connects scan data to traffic/analytics data to
 * produce concrete dollar figures.
 *
 * Key insight: ~15-20% of the global population has some form
 * of disability. If your site is inaccessible, you're losing
 * that segment plus their households (2.3x multiplier).
 *
 * Sources:
 * - WHO: 1.3B people globally with significant disabilities (16%)
 * - CDC: 26% of US adults have some disability
 * - Purple Pound (UK): £274B annual spending power
 * - US: $490B+ disposable income for disabled adults
 * ---------------------------------------------------------
 */

export interface TrafficData {
  monthlyVisitors: number;
  avgOrderValue?: number;        // In user's currency
  conversionRate?: number;       // As decimal (0.03 = 3%)
  monthlyRevenue?: number;       // Total monthly revenue
  bounceRate?: number;           // As decimal
  currency?: string;             // ISO code
}

export interface AccessibilityData {
  score: number;                 // 0-100
  totalViolations: number;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
}

export interface RevenueImpactResult {
  // Core metrics
  estimatedMonthlyLoss: number;
  estimatedAnnualLoss: number;
  affectedPopulationPercent: number;
  unreachableVisitorsMonthly: number;
  currency: string;

  // Breakdown by impact level
  breakdown: {
    critical: { visitors: number; revenue: number; description: string };
    serious: { visitors: number; revenue: number; description: string };
    moderate: { visitors: number; revenue: number; description: string };
    minor: { visitors: number; revenue: number; description: string };
  };

  // Per-violation cost
  costPerViolation: number;

  // Industry context. NOTE: avgScore is an assumed baseline, not measured peer
  // data — there is no real percentile/ranking, only this score-vs-baseline compare.
  industryComparison: {
    avgScore: number;
    yourScore: number;
    competitorEstimate: string;
  };

  // Legal risk
  legalRisk: {
    level: "low" | "medium" | "high" | "critical";
    estimatedLitigationCost: number;
    lawsuitProbability: string;
    relevantLaws: string[];
  };

  // Recommendations
  recommendations: Array<{
    action: string;
    potentialRecovery: number;
    effort: string;
    priority: number;
  }>;
}

// Disability prevalence factors by region
const DISABILITY_PREVALENCE: Record<string, number> = {
  US: 0.26,    // CDC: 26% of US adults
  UK: 0.22,    // 22% of UK population
  EU: 0.18,    // ~18% EU average
  AU: 0.18,    // 18% of Australians
  CA: 0.22,    // 22% of Canadians
  GLOBAL: 0.16, // WHO: 16% globally
};

// Household multiplier — disabled users influence household decisions
const HOUSEHOLD_MULTIPLIER = 2.3;

// Impact weights — how much each severity level affects usability
const IMPACT_WEIGHTS = {
  critical: 1.0,    // Complete blocker — user cannot proceed
  serious: 0.7,     // Major friction — many users abandon
  moderate: 0.3,    // Annoying but workaround possible
  minor: 0.1,       // Slight inconvenience
};

// Score-to-accessibility mapping
// Score 100 = fully accessible, Score 0 = completely inaccessible
function scoreToBlockedPercent(score: number): number {
  // Non-linear: low scores block exponentially more users
  if (score >= 95) return 0.02;
  if (score >= 90) return 0.05;
  if (score >= 80) return 0.10;
  if (score >= 70) return 0.18;
  if (score >= 60) return 0.30;
  if (score >= 50) return 0.45;
  if (score >= 40) return 0.60;
  return 0.80;
}

/**
 * Calculate revenue impact of accessibility issues.
 */
export function calculateRevenueImpact(
  traffic: TrafficData,
  accessibility: AccessibilityData,
  region: string = "GLOBAL"
): RevenueImpactResult {
  const currency = traffic.currency || "USD";
  const prevalence = DISABILITY_PREVALENCE[region] || DISABILITY_PREVALENCE.GLOBAL;

  // Calculate affected visitor pool
  const disabledVisitors = Math.round(traffic.monthlyVisitors * prevalence);
  const blockedPercent = scoreToBlockedPercent(accessibility.score);
  const unreachableVisitors = Math.round(disabledVisitors * blockedPercent);

  // Include household effect — disabled users' purchasing decisions
  // affect entire household
  const effectiveUnreachable = Math.round(unreachableVisitors * HOUSEHOLD_MULTIPLIER);

  // Calculate revenue per visitor
  let revenuePerVisitor: number;
  if (traffic.monthlyRevenue) {
    revenuePerVisitor = traffic.monthlyRevenue / traffic.monthlyVisitors;
  } else if (traffic.avgOrderValue && traffic.conversionRate) {
    revenuePerVisitor = traffic.avgOrderValue * traffic.conversionRate;
  } else {
    // Industry average: ~$2.50 revenue per visitor
    revenuePerVisitor = 2.50;
  }

  // Total monthly loss
  const monthlyLoss = effectiveUnreachable * revenuePerVisitor;
  const annualLoss = monthlyLoss * 12;

  // Breakdown by violation severity
  const totalWeightedViolations =
    accessibility.critical * IMPACT_WEIGHTS.critical +
    accessibility.serious * IMPACT_WEIGHTS.serious +
    accessibility.moderate * IMPACT_WEIGHTS.moderate +
    accessibility.minor * IMPACT_WEIGHTS.minor;

  const revenuePerWeight = totalWeightedViolations > 0
    ? monthlyLoss / totalWeightedViolations
    : 0;

  const breakdown = {
    critical: {
      visitors: Math.round(unreachableVisitors * (accessibility.critical * IMPACT_WEIGHTS.critical / Math.max(totalWeightedViolations, 1))),
      revenue: Math.round(accessibility.critical * IMPACT_WEIGHTS.critical * revenuePerWeight),
      description: "Complete blockers — users cannot access content at all",
    },
    serious: {
      visitors: Math.round(unreachableVisitors * (accessibility.serious * IMPACT_WEIGHTS.serious / Math.max(totalWeightedViolations, 1))),
      revenue: Math.round(accessibility.serious * IMPACT_WEIGHTS.serious * revenuePerWeight),
      description: "Major friction — significant portion of users will abandon",
    },
    moderate: {
      visitors: Math.round(unreachableVisitors * (accessibility.moderate * IMPACT_WEIGHTS.moderate / Math.max(totalWeightedViolations, 1))),
      revenue: Math.round(accessibility.moderate * IMPACT_WEIGHTS.moderate * revenuePerWeight),
      description: "Workaround possible but degrades experience significantly",
    },
    minor: {
      visitors: Math.round(unreachableVisitors * (accessibility.minor * IMPACT_WEIGHTS.minor / Math.max(totalWeightedViolations, 1))),
      revenue: Math.round(accessibility.minor * IMPACT_WEIGHTS.minor * revenuePerWeight),
      description: "Slight inconvenience — minor impact on completion rate",
    },
  };

  // Cost per violation
  const costPerViolation = accessibility.totalViolations > 0
    ? Math.round(monthlyLoss / accessibility.totalViolations)
    : 0;

  // Industry comparison. `industryAvg` is an assumed typical automated-scan score,
  // NOT measured peer data — so we present an honest score-vs-baseline compare and
  // deliberately do NOT manufacture a "percentile" (the old value was just the score).
  const industryAvg = 72;

  // Legal risk assessment
  const legalRisk = assessLegalRisk(accessibility, region, annualLoss);

  // Recommendations
  const recommendations = generateRecommendations(
    accessibility,
    monthlyLoss,
    revenuePerWeight
  );

  return {
    estimatedMonthlyLoss: Math.round(monthlyLoss),
    estimatedAnnualLoss: Math.round(annualLoss),
    affectedPopulationPercent: Math.round(prevalence * 100),
    unreachableVisitorsMonthly: effectiveUnreachable,
    currency,
    breakdown,
    costPerViolation,
    industryComparison: {
      avgScore: industryAvg,
      yourScore: Math.round(accessibility.score),
      competitorEstimate: accessibility.score >= industryAvg
        ? "At or above the assumed industry baseline"
        : "Below the assumed industry baseline",
    },
    legalRisk,
    recommendations,
  };
}

function assessLegalRisk(
  accessibility: AccessibilityData,
  region: string,
  _annualLoss: number
): RevenueImpactResult["legalRisk"] {
  const laws: string[] = [];

  if (["US", "GLOBAL"].includes(region)) laws.push("ADA Title III", "Section 508");
  if (["UK", "EU", "GLOBAL"].includes(region)) laws.push("EN 301 549", "EAA (European Accessibility Act)");
  if (["CA", "GLOBAL"].includes(region)) laws.push("AODA (Ontario)");
  if (["AU", "GLOBAL"].includes(region)) laws.push("DDA (Disability Discrimination Act)");

  let level: "low" | "medium" | "high" | "critical";
  let probability: string;
  let litigationCost: number;

  if (accessibility.score >= 90) {
    level = "low";
    probability = "<5% annual probability";
    litigationCost = 0;
  } else if (accessibility.score >= 70) {
    level = "medium";
    probability = "10-15% annual probability";
    litigationCost = 50000;
  } else if (accessibility.score >= 50) {
    level = "high";
    probability = "25-40% annual probability";
    litigationCost = 150000;
  } else {
    level = "critical";
    probability = ">50% annual probability";
    litigationCost = 350000;
  }

  return {
    level,
    estimatedLitigationCost: litigationCost,
    lawsuitProbability: probability,
    relevantLaws: laws,
  };
}

function generateRecommendations(
  accessibility: AccessibilityData,
  monthlyLoss: number,
  revenuePerWeight: number
): RevenueImpactResult["recommendations"] {
  const recs: RevenueImpactResult["recommendations"] = [];

  if (accessibility.critical > 0) {
    recs.push({
      action: `Fix ${accessibility.critical} critical violations (complete blockers)`,
      potentialRecovery: Math.round(accessibility.critical * IMPACT_WEIGHTS.critical * revenuePerWeight),
      effort: "1-2 weeks",
      priority: 1,
    });
  }

  if (accessibility.serious > 0) {
    recs.push({
      action: `Fix ${accessibility.serious} serious violations (major friction points)`,
      potentialRecovery: Math.round(accessibility.serious * IMPACT_WEIGHTS.serious * revenuePerWeight),
      effort: "2-4 weeks",
      priority: 2,
    });
  }

  if (accessibility.moderate > 0) {
    recs.push({
      action: `Address ${accessibility.moderate} moderate violations (UX improvements)`,
      potentialRecovery: Math.round(accessibility.moderate * IMPACT_WEIGHTS.moderate * revenuePerWeight),
      effort: "1-2 months",
      priority: 3,
    });
  }

  // Always recommend ongoing monitoring
  recs.push({
    action: "Enable CI gatekeeper to prevent regression",
    potentialRecovery: Math.round(monthlyLoss * 0.3), // Prevent 30% of future loss
    effort: "1 hour setup",
    priority: recs.length + 1,
  });

  recs.push({
    action: "Deploy auto-remediation script for immediate partial fix",
    potentialRecovery: Math.round(monthlyLoss * 0.4), // Recover ~40% immediately
    effort: "5 minutes",
    priority: recs.length + 1,
  });

  return recs;
}
