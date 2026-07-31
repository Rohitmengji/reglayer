/**
 * RegLayer — Accessibility Digital Twin (what-if simulation engine)
 *
 * WHY THIS EXISTS:
 *   Every other view shows TODAY. This shows a simulated FUTURE. Pick a set of
 *   fixes and forecast the whole downstream chain — like financial modelling:
 *
 *     Fix these N issues → risk drops → score rises → fewer lawsuits →
 *     recovered traffic → SEO uplift → revenue impact.
 *
 *   It answers the question that unlocks budget: "what do we GET if we fix this?"
 *
 * DESIGN:
 *   - PURE core (`simulateDigitalTwin`) — no DB, fully deterministic, unit-tested.
 *   - Reuses the canonical primitives instead of inventing parallel formulas:
 *       • score      → scoreFromStoredViolations (reportScore.ts)
 *       • legal risk → computeLitigationSurface  (litigationSurface.ts)
 *       • weights    → LITIGATION_WEIGHTS / INDUSTRY_/GEO_MULTIPLIERS
 *   - Economic layers (lawsuits, traffic, SEO, revenue) are explicit models with
 *     STATED assumptions and a conservative/likely/optimistic band — every number
 *     is defensible and labelled an estimate, never presented as fact.
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { scoreFromStoredViolations } from "@/lib/scoring/reportScore";
import { computeLitigationSurface, type SurfaceViolation } from "@/lib/risk/litigationSurface";
import {
  LITIGATION_WEIGHTS,
  INDUSTRY_MULTIPLIERS,
  GEO_MULTIPLIERS,
} from "@/lib/risk/litigationWeights";

// ── Model constants (assumptions — documented, deterministic) ───────────────

/**
 * Base annual probability that a HIGH-exposure site (litigation score 100)
 * receives an ADA web demand letter / suit, before industry & geo scaling.
 * Grounded in the ~4,600 ADA web filings/yr against a long tail of at-risk sites.
 */
const BASE_ANNUAL_FILING_RATE = 0.04;

/** WHO: ~16% of the world lives with a significant disability. */
const DEFAULT_DISABLED_POPULATION_RATE = 0.16;

/**
 * Of disabled users who hit a blocking barrier, the share who abandon AND would
 * return once it's fixed. Conservative — not everyone blocked comes back.
 */
const RECOVERY_FACTOR = 0.6;

/** Organic-traffic uplift weight per SEO-relevant rule fixed (fraction of visits). */
const SEO_RULE_UPLIFT: Record<string, number> = {
  "image-alt": 0.03, // alt text → image search + relevance
  "link-name": 0.025, // descriptive links → crawlability + anchor signals
  "document-title": 0.03, // title tag is a top ranking factor
  "html-has-lang": 0.005,
  "html-lang-valid": 0.005,
  "heading-order": 0.02, // semantic structure → featured snippets
  "label": 0.005,
  "meta-viewport": 0.015, // mobile usability signal
};

/** Cap on total modelled SEO uplift so stacked fixes stay credible. */
const SEO_UPLIFT_CAP = 0.15;

/** Scenario multipliers applied to the soft (economic) projections. */
const SCENARIO_FACTORS = { conservative: 0.5, likely: 1.0, optimistic: 1.6 } as const;

// ── Types ───────────────────────────────────────────────────────────────────

export interface TwinViolation {
  id?: string;
  ruleId: string;
  impact: string;
  affectedElements: unknown;
  wcagCriteria?: string | null;
  url?: string;
}

export interface TwinAssumptions {
  /** Monthly organic + direct visitors to the affected surface. */
  monthlyVisitors: number;
  /** Purchase / signup conversion rate (0..1). */
  conversionRate: number;
  /** Average value of one conversion ($). */
  averageOrderValue: number;
  /** Industry key (drives litigation multiplier). */
  industry: string;
  /** Primary jurisdiction key (drives litigation multiplier). */
  geo: string;
  /** Share of visitors living with a disability (0..1). */
  disabledPopulationRate: number;
}

export const DEFAULT_ASSUMPTIONS: TwinAssumptions = {
  monthlyVisitors: 10_000,
  conversionRate: 0.02,
  averageOrderValue: 75,
  industry: "other",
  geo: "other",
  disabledPopulationRate: DEFAULT_DISABLED_POPULATION_RATE,
};

export type FixStrategy =
  | "all"
  | "critical"
  | "critical-serious"
  | "litigation-drivers";

export interface RiskProjection {
  score: number;
  tier: string;
  estimatedExposure: number;
  /** Annualised probability of an ADA demand/suit (0..1). */
  lawsuitProbability: number;
  /** probability × industry/geo-adjusted exposure. */
  expectedAnnualLegalCost: number;
}

export interface RevenueScenario {
  recoveredMonthlyVisitors: number;
  seoMonthlyVisitors: number;
  monthlyRevenueGain: number;
  annualRevenueGain: number;
  legalCostAvoidedAnnual: number;
  totalAnnualBenefit: number;
}

export interface DigitalTwinResult {
  url: string;
  fixed: { count: number; ruleIds: string[]; remaining: number };
  score: { before: number; after: number; delta: number };
  risk: {
    before: RiskProjection;
    after: RiskProjection;
    exposureReductionUsd: number;
    lawsuitProbabilityReduction: number;
    legalCostAvoidedAnnual: number;
  };
  seo: { fixCount: number; upliftPct: number };
  scenarios: { conservative: RevenueScenario; likely: RevenueScenario; optimistic: RevenueScenario };
  assumptions: TwinAssumptions;
  narrative: string;
}

// ── Pure selection ──────────────────────────────────────────────────────────

/** Resolve which violation IDs a strategy would fix (pure). */
export function resolveFixSelection(
  violations: TwinViolation[],
  selector: { violationIds?: string[]; strategy?: FixStrategy },
): Set<string> {
  if (selector.violationIds && selector.violationIds.length > 0) {
    return new Set(selector.violationIds);
  }
  const strategy = selector.strategy ?? "all";
  const ids = new Set<string>();
  violations.forEach((v, i) => {
    const key = v.id ?? String(i);
    const impact = v.impact.toLowerCase();
    const match =
      strategy === "all" ||
      (strategy === "critical" && impact === "critical") ||
      (strategy === "critical-serious" && (impact === "critical" || impact === "serious")) ||
      (strategy === "litigation-drivers" && v.ruleId in LITIGATION_WEIGHTS);
    if (match) ids.add(key);
  });
  return ids;
}

// ── Pure risk projection ────────────────────────────────────────────────────

function projectRisk(
  violations: TwinViolation[],
  a: TwinAssumptions,
): RiskProjection {
  const surface = computeLitigationSurface(
    violations.map<SurfaceViolation>((v) => ({ ruleId: v.ruleId, impact: v.impact, url: v.url })),
    1, // single-surface prevalence base
  );
  const industryMult = INDUSTRY_MULTIPLIERS[a.industry] ?? INDUSTRY_MULTIPLIERS.other;
  const geoMult = GEO_MULTIPLIERS[a.geo] ?? GEO_MULTIPLIERS.other;

  const lawsuitProbability = clamp(
    (surface.score / 100) * BASE_ANNUAL_FILING_RATE * industryMult * geoMult,
    0,
    0.95,
  );
  const adjustedExposure = surface.estimatedExposure * industryMult * geoMult;

  return {
    score: surface.score,
    tier: surface.tier,
    estimatedExposure: Math.round(surface.estimatedExposure),
    lawsuitProbability: round4(lawsuitProbability),
    expectedAnnualLegalCost: Math.round(lawsuitProbability * adjustedExposure),
  };
}

// ── Pure core ───────────────────────────────────────────────────────────────

/**
 * Simulate the future state after fixing a chosen set of violations.
 * Deterministic — same inputs always yield the same forecast.
 */
export function simulateDigitalTwin(
  violations: TwinViolation[],
  fixedIds: Set<string>,
  opts?: { assumptions?: Partial<TwinAssumptions>; url?: string },
): DigitalTwinResult {
  const a: TwinAssumptions = { ...DEFAULT_ASSUMPTIONS, ...opts?.assumptions };
  const url = opts?.url ?? "";

  const key = (v: TwinViolation, i: number) => v.id ?? String(i);
  const fixed = violations.filter((v, i) => fixedIds.has(key(v, i)));
  const remaining = violations.filter((v, i) => !fixedIds.has(key(v, i)));

  // 1. Score (canonical formula).
  const scoreBefore = scoreFromStoredViolations(violations);
  const scoreAfter = scoreFromStoredViolations(remaining);

  // 2. Legal risk + lawsuits.
  const riskBefore = projectRisk(violations, a);
  const riskAfter = projectRisk(remaining, a);
  const exposureReduction = Math.max(0, riskBefore.expectedAnnualLegalCost - riskAfter.expectedAnnualLegalCost);

  // 3. SEO uplift from SEO-relevant fixes (distinct rules).
  const fixedRules = new Set(fixed.map((v) => v.ruleId));
  let seoUplift = 0;
  let seoFixCount = 0;
  for (const ruleId of fixedRules) {
    const w = SEO_RULE_UPLIFT[ruleId];
    if (w) {
      seoUplift += w;
      seoFixCount++;
    }
  }
  seoUplift = Math.min(SEO_UPLIFT_CAP, seoUplift);

  // 4. Traffic recovery from accessibility gain.
  const accessibilityGain = Math.max(0, (scoreAfter - scoreBefore) / 100);
  const recoverableFraction = a.disabledPopulationRate * accessibilityGain * RECOVERY_FACTOR;

  // 5. Revenue scenarios (band over the soft factors).
  const scenarios = {
    conservative: buildScenario(a, recoverableFraction, seoUplift, exposureReduction, "conservative"),
    likely: buildScenario(a, recoverableFraction, seoUplift, exposureReduction, "likely"),
    optimistic: buildScenario(a, recoverableFraction, seoUplift, exposureReduction, "optimistic"),
  };

  const result: DigitalTwinResult = {
    url,
    fixed: { count: fixed.length, ruleIds: [...fixedRules], remaining: remaining.length },
    score: { before: scoreBefore, after: scoreAfter, delta: round1(scoreAfter - scoreBefore) },
    risk: {
      before: riskBefore,
      after: riskAfter,
      exposureReductionUsd: exposureReduction,
      lawsuitProbabilityReduction: round4(Math.max(0, riskBefore.lawsuitProbability - riskAfter.lawsuitProbability)),
      legalCostAvoidedAnnual: exposureReduction,
    },
    seo: { fixCount: seoFixCount, upliftPct: round4(seoUplift) },
    scenarios,
    assumptions: a,
    narrative: "",
  };
  result.narrative = buildNarrative(result);
  return result;
}

function buildScenario(
  a: TwinAssumptions,
  recoverableFraction: number,
  seoUplift: number,
  legalCostAvoided: number,
  tier: keyof typeof SCENARIO_FACTORS,
): RevenueScenario {
  const factor = SCENARIO_FACTORS[tier];
  const recoveredMonthlyVisitors = a.monthlyVisitors * recoverableFraction * factor;
  const seoMonthlyVisitors = a.monthlyVisitors * seoUplift * factor;
  const extraVisitors = recoveredMonthlyVisitors + seoMonthlyVisitors;
  const monthlyRevenueGain = extraVisitors * a.conversionRate * a.averageOrderValue;
  const annualRevenueGain = monthlyRevenueGain * 12;
  // Legal-cost avoidance also scales with scenario confidence.
  const legalCostAvoidedAnnual = legalCostAvoided * factor;
  return {
    recoveredMonthlyVisitors: Math.round(recoveredMonthlyVisitors),
    seoMonthlyVisitors: Math.round(seoMonthlyVisitors),
    monthlyRevenueGain: Math.round(monthlyRevenueGain),
    annualRevenueGain: Math.round(annualRevenueGain),
    legalCostAvoidedAnnual: Math.round(legalCostAvoidedAnnual),
    totalAnnualBenefit: Math.round(annualRevenueGain + legalCostAvoidedAnnual),
  };
}

function buildNarrative(r: DigitalTwinResult): string {
  if (r.fixed.count === 0) return "No fixes selected — the twin mirrors today's state.";
  const scoreMsg = `Fixing ${r.fixed.count} issue${r.fixed.count === 1 ? "" : "s"} lifts the score ${r.score.before} → ${r.score.after} (+${r.score.delta}).`;
  const riskMsg =
    r.risk.before.tier !== r.risk.after.tier
      ? ` Litigation exposure drops from ${r.risk.before.tier} to ${r.risk.after.tier}`
      : ` Litigation risk eases within the ${r.risk.after.tier} tier`;
  const costMsg = r.risk.legalCostAvoidedAnnual > 0 ? `, avoiding ~$${r.risk.legalCostAvoidedAnnual.toLocaleString()}/yr in expected legal cost.` : ".";
  const revMsg = ` Projected upside: ~$${r.scenarios.likely.totalAnnualBenefit.toLocaleString()}/yr (likely case; $${r.scenarios.conservative.totalAnnualBenefit.toLocaleString()}–$${r.scenarios.optimistic.totalAnnualBenefit.toLocaleString()} range).`;
  return scoreMsg + riskMsg + costMsg + revMsg;
}

// ── DB wrapper ──────────────────────────────────────────────────────────────

/**
 * Load a scan and run the twin. Selection is by explicit violation IDs or a
 * strategy; assumptions default to conservative baselines and can be overridden.
 */
export async function runDigitalTwin(
  scanId: string,
  opts: {
    violationIds?: string[];
    strategy?: FixStrategy;
    assumptions?: Partial<TwinAssumptions>;
    workspaceId?: string | null;
  },
): Promise<DigitalTwinResult | null> {
  const scan = await prisma.scan.findFirst({
    where: { id: scanId, ...(opts.workspaceId ? { workspaceId: opts.workspaceId } : {}) },
    select: {
      url: true,
      violations: {
        select: { id: true, ruleId: true, impact: true, affectedElements: true, wcagCriteria: true },
      },
    },
  });
  if (!scan) return null;

  const violations: TwinViolation[] = scan.violations.map((v) => ({
    id: v.id,
    ruleId: v.ruleId,
    impact: v.impact,
    affectedElements: v.affectedElements,
    wcagCriteria: v.wcagCriteria,
    url: scan.url,
  }));

  const fixedIds = resolveFixSelection(violations, {
    violationIds: opts.violationIds,
    strategy: opts.strategy,
  });

  return simulateDigitalTwin(violations, fixedIds, { assumptions: opts.assumptions, url: scan.url });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
