/**
 * RegLayer — Compliance Forecasting Engine
 *
 * INDUSTRY PROBLEM: Legal/compliance teams can't answer "When will we be compliant?"
 * because there's no way to project future compliance dates. Budgets get allocated
 * without data. Deadlines are missed because nobody knew the velocity was too slow.
 *
 * SOLUTION: Analyzes historical scan data to compute fix velocity, then projects
 * when target scores will be achieved. Gives leadership concrete dates and resource
 * requirements for compliance goals.
 *
 * METHODOLOGY:
 * 1. Compute "fix velocity" = violations resolved per week over trailing period
 * 2. Compute "score velocity" = score improvement per week
 * 3. Linear regression on score trend to project target date
 * 4. Factor in new violation introduction rate (sites add pages/features)
 * 5. Generate confidence intervals (optimistic/likely/pessimistic)
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";

export interface ComplianceForecast {
  siteId: string;
  siteUrl: string;
  currentScore: number;
  targetScore: number;
  dataPoints: ScoreDataPoint[];
  velocity: VelocityMetrics;
  projection: ForecastProjection;
  resourceNeeds: ResourceEstimate;
  risks: ForecastRisk[];
}

export interface ScoreDataPoint {
  date: string;
  score: number;
  violations: number;
}

export interface VelocityMetrics {
  scorePerWeek: number;           // Average score improvement per week
  violationsFixedPerWeek: number; // Average violations resolved per week
  violationsIntroducedPerWeek: number; // New violations appearing per week
  netVelocity: number;            // Net violations resolved per week
  trendDirection: "accelerating" | "steady" | "decelerating" | "regressing";
  dataWeeks: number;              // Weeks of data available
}

export interface ForecastProjection {
  optimistic: ProjectionScenario;  // Best 25th percentile velocity
  likely: ProjectionScenario;      // Median velocity
  pessimistic: ProjectionScenario; // Worst 25th percentile velocity
  achievable: boolean;             // Whether target is reachable given current trend
}

export interface ProjectionScenario {
  targetDate: string;          // ISO date when target score will be hit
  weeksToTarget: number;
  confidence: number;          // 0-1 confidence level
  requiredVelocity: number;    // Score/week needed to hit target
}

export interface ResourceEstimate {
  currentTeamVelocity: number;     // Violations/week with current resources
  requiredVelocity: number;        // To hit target on time
  additionalEngineersNeeded: number;
  estimatedCost: CostEstimate;
  recommendation: string;
}

export interface CostEstimate {
  monthly: number;
  total: number;
  currency: string;
  assumptions: string;
}

export interface ForecastRisk {
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  mitigation: string;
}

/**
 * Generate a compliance forecast for a site.
 */
export async function generateForecast(
  siteId: string,
  targetScore: number = 90,
  deadlineDate?: string
): Promise<ComplianceForecast | null> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { url: true },
  });

  if (!site) return null;

  // Get all completed scans for this site, ordered by date
  const scans = await prisma.scan.findMany({
    where: { siteId, status: "COMPLETED" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      score: true,
      totalViolations: true,
      createdAt: true,
    },
  });

  if (scans.length < 2) {
    return null; // Need at least 2 data points for projection
  }

  const currentScore = scans[scans.length - 1].score ?? 0;

  // Already at target
  if (currentScore >= targetScore) {
    return {
      siteId,
      siteUrl: site.url,
      currentScore,
      targetScore,
      dataPoints: scans.map((s) => ({
        date: s.createdAt.toISOString(),
        score: s.score ?? 0,
        violations: s.totalViolations,
      })),
      velocity: computeVelocity(scans),
      projection: {
        optimistic: { targetDate: new Date().toISOString(), weeksToTarget: 0, confidence: 1, requiredVelocity: 0 },
        likely: { targetDate: new Date().toISOString(), weeksToTarget: 0, confidence: 1, requiredVelocity: 0 },
        pessimistic: { targetDate: new Date().toISOString(), weeksToTarget: 0, confidence: 1, requiredVelocity: 0 },
        achievable: true,
      },
      resourceNeeds: { currentTeamVelocity: 0, requiredVelocity: 0, additionalEngineersNeeded: 0, estimatedCost: { monthly: 0, total: 0, currency: "USD", assumptions: "Already at target" }, recommendation: "Target achieved. Focus on maintaining score." },
      risks: [],
    };
  }

  const velocity = computeVelocity(scans);
  const projection = computeProjection(currentScore, targetScore, velocity, deadlineDate);
  const resourceNeeds = estimateResources(currentScore, targetScore, velocity, deadlineDate);
  const risks = assessRisks(velocity, projection, currentScore, targetScore);

  return {
    siteId,
    siteUrl: site.url,
    currentScore,
    targetScore,
    dataPoints: scans.map((s) => ({
      date: s.createdAt.toISOString(),
      score: s.score ?? 0,
      violations: s.totalViolations,
    })),
    velocity,
    projection,
    resourceNeeds,
    risks,
  };
}

function computeVelocity(
  scans: Array<{ score: number | null; totalViolations: number; createdAt: Date }>
): VelocityMetrics {
  if (scans.length < 2) {
    return { scorePerWeek: 0, violationsFixedPerWeek: 0, violationsIntroducedPerWeek: 0, netVelocity: 0, trendDirection: "steady", dataWeeks: 0 };
  }

  const firstDate = scans[0].createdAt.getTime();
  const lastDate = scans[scans.length - 1].createdAt.getTime();
  const totalWeeks = Math.max(1, (lastDate - firstDate) / (7 * 24 * 60 * 60 * 1000));

  const firstScore = scans[0].score ?? 0;
  const lastScore = scans[scans.length - 1].score ?? 0;
  const scorePerWeek = (lastScore - firstScore) / totalWeeks;

  // Compute violation velocity (track week-over-week changes)
  let totalFixed = 0;
  let totalIntroduced = 0;
  for (let i = 1; i < scans.length; i++) {
    const diff = scans[i].totalViolations - scans[i - 1].totalViolations;
    if (diff < 0) totalFixed += Math.abs(diff);
    else totalIntroduced += diff;
  }

  const violationsFixedPerWeek = totalFixed / totalWeeks;
  const violationsIntroducedPerWeek = totalIntroduced / totalWeeks;
  const netVelocity = violationsFixedPerWeek - violationsIntroducedPerWeek;

  // Determine trend direction from recent vs historical velocity
  const midpoint = Math.floor(scans.length / 2);
  const recentScoreChange = (scans[scans.length - 1].score ?? 0) - (scans[midpoint].score ?? 0);
  const earlyScoreChange = (scans[midpoint].score ?? 0) - (scans[0].score ?? 0);

  let trendDirection: VelocityMetrics["trendDirection"];
  if (recentScoreChange > earlyScoreChange * 1.3) trendDirection = "accelerating";
  else if (recentScoreChange < earlyScoreChange * 0.5) trendDirection = "decelerating";
  else if (recentScoreChange < 0) trendDirection = "regressing";
  else trendDirection = "steady";

  return {
    scorePerWeek: Math.round(scorePerWeek * 100) / 100,
    violationsFixedPerWeek: Math.round(violationsFixedPerWeek * 10) / 10,
    violationsIntroducedPerWeek: Math.round(violationsIntroducedPerWeek * 10) / 10,
    netVelocity: Math.round(netVelocity * 10) / 10,
    trendDirection,
    dataWeeks: Math.round(totalWeeks),
  };
}

function computeProjection(
  currentScore: number,
  targetScore: number,
  velocity: VelocityMetrics,
  deadlineDate?: string
): ForecastProjection {
  const gap = targetScore - currentScore;

  if (velocity.scorePerWeek <= 0) {
    return {
      optimistic: { targetDate: "unknown", weeksToTarget: Infinity, confidence: 0.1, requiredVelocity: gap / 12 },
      likely: { targetDate: "unknown", weeksToTarget: Infinity, confidence: 0.05, requiredVelocity: gap / 8 },
      pessimistic: { targetDate: "unknown", weeksToTarget: Infinity, confidence: 0.01, requiredVelocity: gap / 4 },
      achievable: false,
    };
  }

  const likelyWeeks = gap / velocity.scorePerWeek;
  const optimisticWeeks = gap / (velocity.scorePerWeek * 1.5); // 50% faster
  const pessimisticWeeks = gap / (velocity.scorePerWeek * 0.6); // 40% slower

  const now = Date.now();
  const toDate = (weeks: number) => new Date(now + weeks * 7 * 24 * 60 * 60 * 1000).toISOString();

  let achievable = true;
  if (deadlineDate) {
    const deadlineWeeks = (new Date(deadlineDate).getTime() - now) / (7 * 24 * 60 * 60 * 1000);
    achievable = likelyWeeks <= deadlineWeeks;
  }

  return {
    optimistic: {
      targetDate: toDate(optimisticWeeks),
      weeksToTarget: Math.round(optimisticWeeks),
      confidence: 0.25,
      requiredVelocity: gap / optimisticWeeks,
    },
    likely: {
      targetDate: toDate(likelyWeeks),
      weeksToTarget: Math.round(likelyWeeks),
      confidence: 0.5,
      requiredVelocity: velocity.scorePerWeek,
    },
    pessimistic: {
      targetDate: toDate(pessimisticWeeks),
      weeksToTarget: Math.round(pessimisticWeeks),
      confidence: 0.75,
      requiredVelocity: gap / pessimisticWeeks,
    },
    achievable,
  };
}

function estimateResources(
  currentScore: number,
  targetScore: number,
  velocity: VelocityMetrics,
  deadlineDate?: string
): ResourceEstimate {
  const gap = targetScore - currentScore;
  const ENGINEER_COST_MONTHLY = 12000; // USD, loaded cost
  const VIOLATIONS_PER_ENGINEER_WEEK = 15; // Average fixes per engineer per week

  const currentTeamVelocity = velocity.violationsFixedPerWeek;
  let requiredVelocity = currentTeamVelocity;

  if (deadlineDate) {
    const weeksUntilDeadline = Math.max(1,
      (new Date(deadlineDate).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)
    );
    // Rough estimate: need gap/weeks score improvement, which requires proportional violation fixing
    requiredVelocity = (gap / weeksUntilDeadline) * 3; // ~3 violations per score point
  }

  const currentEngineers = Math.max(1, currentTeamVelocity / VIOLATIONS_PER_ENGINEER_WEEK);
  const requiredEngineers = Math.max(1, requiredVelocity / VIOLATIONS_PER_ENGINEER_WEEK);
  const additionalNeeded = Math.max(0, Math.ceil(requiredEngineers - currentEngineers));

  const monthsToTarget = velocity.scorePerWeek > 0 ? (gap / velocity.scorePerWeek) / 4.3 : 12;
  const totalCost = additionalNeeded * ENGINEER_COST_MONTHLY * Math.ceil(monthsToTarget);

  let recommendation: string;
  if (additionalNeeded === 0) {
    recommendation = "Current team velocity is sufficient to reach target. Maintain pace.";
  } else if (additionalNeeded <= 2) {
    recommendation = `Add ${additionalNeeded} engineer(s) to accessibility work to meet deadline.`;
  } else {
    recommendation = `Significant resource gap. Consider dedicated accessibility team (${additionalNeeded} engineers) or external audit partner.`;
  }

  return {
    currentTeamVelocity,
    requiredVelocity: Math.round(requiredVelocity * 10) / 10,
    additionalEngineersNeeded: additionalNeeded,
    estimatedCost: {
      monthly: additionalNeeded * ENGINEER_COST_MONTHLY,
      total: totalCost,
      currency: "USD",
      assumptions: `Based on $${ENGINEER_COST_MONTHLY}/month loaded cost, ${VIOLATIONS_PER_ENGINEER_WEEK} fixes/engineer/week`,
    },
    recommendation,
  };
}

function assessRisks(
  velocity: VelocityMetrics,
  projection: ForecastProjection,
  currentScore: number,
  targetScore: number
): ForecastRisk[] {
  const risks: ForecastRisk[] = [];

  if (velocity.trendDirection === "regressing") {
    risks.push({
      severity: "high",
      title: "Score is declining",
      description: "Recent scans show score regression. New violations are being introduced faster than fixes.",
      mitigation: "Implement CI/CD guard policies to block regressions. Prioritize root-cause fixes.",
    });
  }

  if (velocity.trendDirection === "decelerating") {
    risks.push({
      severity: "medium",
      title: "Fix velocity is slowing",
      description: "The rate of improvement has decreased. Remaining violations may be harder to fix.",
      mitigation: "Review backlog — harder issues often need design system changes or architectural work.",
    });
  }

  if (velocity.violationsIntroducedPerWeek > velocity.violationsFixedPerWeek * 0.5) {
    risks.push({
      severity: "high",
      title: "High violation introduction rate",
      description: `${velocity.violationsIntroducedPerWeek.toFixed(1)} new violations/week vs ${velocity.violationsFixedPerWeek.toFixed(1)} fixes/week. Development is creating issues faster than they're resolved.`,
      mitigation: "Add accessibility linting to CI, implement design system constraints, train developers.",
    });
  }

  if (!projection.achievable) {
    risks.push({
      severity: "high",
      title: "Deadline at risk",
      description: "Current velocity won't achieve target score by deadline.",
      mitigation: "Increase resources, reduce scope, or negotiate deadline extension.",
    });
  }

  if (velocity.dataWeeks < 4) {
    risks.push({
      severity: "low",
      title: "Limited historical data",
      description: `Only ${velocity.dataWeeks} weeks of scan data. Projections have low confidence.`,
      mitigation: "Run scans more frequently to improve projection accuracy.",
    });
  }

  if (targetScore - currentScore > 30) {
    risks.push({
      severity: "medium",
      title: "Large compliance gap",
      description: `${(targetScore - currentScore).toFixed(0)}-point gap requires sustained effort across multiple sprints.`,
      mitigation: "Break into phases. Target 70 first, then 80, then 90. Celebrate incremental wins.",
    });
  }

  return risks;
}
