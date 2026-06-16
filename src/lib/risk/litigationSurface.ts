/**
 * RegLayer — ADA Litigation Surface (PURE core)
 *
 * WHAT: Turns a whole-site crawl's aggregate accessibility violations into a
 * site-wide "litigation surface" — WHICH of the issue types that actually drive
 * ADA Title III web lawsuits are present, HOW widespread they are, and the
 * resulting exposure tier + dollar estimate.
 *
 * WHY: The per-scan legalRiskEngine scores ONE page against the DB. A crawl
 * audits a whole site, so its result should answer the question a GC actually
 * asks — "across our whole site, how exposed are we, and to what?" This is the
 * concrete backing for the Public Site mode's "ADA litigation surface" promise.
 *
 * Model (prevalence-weighted, deterministic, no Date/Math.random):
 *   For each litigation-driving rule R present in the crawl:
 *     prevalence_R   = affectedPages_R / pagesScanned            (0..1)
 *     impact_R       = mean IMPACT_MULTIPLIER over R's violations (default 1.0)
 *     contribution_R = weight_R * impact_R * prevalence_R
 *   score = round( Σ contribution_R / (Σ_all weight_R * 2.0) * 100 )   → 0..100
 *   tier  = LOW <25 | MODERATE <50 | HIGH <75 | CRITICAL otherwise
 *   exposure_R = avgSettlement_R * frequency_R * (0.5 + 0.5*prevalence_R)
 *   estimatedExposure = min(cap, Σ exposure_R)
 *
 * Prevalence (not raw count) drives the score so a site-wide surface reads as
 * "how much of the site is affected", and a clean site scores a truthful 0.
 */

import {
  LITIGATION_WEIGHTS,
  IMPACT_MULTIPLIERS,
  LITIGATION_RULE_INFO,
} from "./litigationWeights";

export type LitigationTier = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

/** Minimal violation shape the surface needs (matches the crawler's allViolations). */
export interface SurfaceViolation {
  ruleId: string;
  impact?: string;
  url?: string;
}

export interface LitigationFactor {
  ruleId: string;
  /** Plain-English label, WCAG criterion, and why plaintiffs cite it. */
  label: string;
  wcag: string;
  plaintiffNote: string;
  /** Total violations of this rule across the crawl. */
  occurrences: number;
  /** Distinct pages where this rule failed. */
  affectedPages: number;
  /** Share of filed ADA web lawsuits citing this issue (0..1). */
  lawsuitFrequency: number;
  /** Weighted contribution to the surface score. */
  contribution: number;
  /** Estimated dollar exposure attributed to this issue type. */
  estimatedExposure: number;
  /** A few example pages (deduped, capped). */
  sampleUrls: string[];
}

export interface LitigationSurface {
  pagesScanned: number;
  /** 0–100 site-wide litigation exposure (higher = more exposed). */
  score: number;
  tier: LitigationTier;
  /** Combined estimated ADA exposure ($), capped. */
  estimatedExposure: number;
  /** How many of the 6 high-litigation issue types are present. */
  coveredRuleCount: number;
  totalHighRiskRules: number;
  /** Litigation-driving issues present, sorted by contribution (desc). */
  factors: LitigationFactor[];
  /** One-line plain-English summary. */
  summary: string;
}

/** Upper bound on the reported exposure so a huge crawl can't print a silly number. */
const EXPOSURE_CAP = 500_000;
const SAMPLE_URLS_PER_FACTOR = 4;

function tierFor(score: number): LitigationTier {
  if (score < 25) return "LOW";
  if (score < 50) return "MODERATE";
  if (score < 75) return "HIGH";
  return "CRITICAL";
}

/**
 * Compute the site-wide ADA litigation surface from a crawl's aggregate
 * violations. Pure — same inputs always yield the same output.
 *
 * @param violations  every violation across all crawled pages (ruleId/impact/url)
 * @param pagesScanned number of pages successfully scanned (the prevalence base)
 */
export function computeLitigationSurface(
  violations: SurfaceViolation[],
  pagesScanned: number,
): LitigationSurface {
  const totalHighRiskRules = Object.keys(LITIGATION_WEIGHTS).length;
  const base = Math.max(1, pagesScanned);

  // Group the litigation-relevant violations by rule.
  const byRule = new Map<
    string,
    { occurrences: number; pages: Set<string>; impactSum: number; impactN: number; urls: string[] }
  >();
  for (const v of violations) {
    if (!v || !v.ruleId || !(v.ruleId in LITIGATION_WEIGHTS)) continue;
    let g = byRule.get(v.ruleId);
    if (!g) {
      g = { occurrences: 0, pages: new Set(), impactSum: 0, impactN: 0, urls: [] };
      byRule.set(v.ruleId, g);
    }
    g.occurrences++;
    if (v.url) {
      g.pages.add(v.url);
      if (g.urls.length < SAMPLE_URLS_PER_FACTOR && !g.urls.includes(v.url)) g.urls.push(v.url);
    }
    const im = v.impact ? IMPACT_MULTIPLIERS[v.impact] : undefined;
    g.impactSum += im ?? IMPACT_MULTIPLIERS.moderate;
    g.impactN++;
  }

  // Normalization ceiling: every rule, full prevalence, critical impact.
  const sumWeights = Object.values(LITIGATION_WEIGHTS).reduce((s, w) => s + w.weight, 0);
  const maxRaw = sumWeights * IMPACT_MULTIPLIERS.critical;

  let rawScore = 0;
  let estimatedExposure = 0;
  const factors: LitigationFactor[] = [];

  for (const [ruleId, g] of byRule) {
    const w = LITIGATION_WEIGHTS[ruleId];
    const info = LITIGATION_RULE_INFO[ruleId];
    const affectedPages = g.pages.size > 0 ? g.pages.size : Math.min(g.occurrences, base);
    const prevalence = Math.min(1, affectedPages / base);
    const avgImpact = g.impactN > 0 ? g.impactSum / g.impactN : IMPACT_MULTIPLIERS.moderate;
    const contribution = w.weight * avgImpact * prevalence;
    rawScore += contribution;

    const exposure = w.avgSettlement * w.frequency * (0.5 + 0.5 * prevalence);
    estimatedExposure += exposure;

    factors.push({
      ruleId,
      label: info?.label ?? ruleId,
      wcag: info?.wcag ?? "WCAG",
      plaintiffNote: info?.plaintiffNote ?? "",
      occurrences: g.occurrences,
      affectedPages,
      lawsuitFrequency: w.frequency,
      contribution: Math.round(contribution * 1000) / 1000,
      estimatedExposure: Math.round(exposure),
      sampleUrls: g.urls,
    });
  }

  factors.sort((a, b) => b.contribution - a.contribution);

  const score = maxRaw > 0 ? Math.round(Math.min(100, (rawScore / maxRaw) * 100)) : 0;
  const tier = tierFor(score);
  const cappedExposure = Math.min(EXPOSURE_CAP, Math.round(estimatedExposure));
  const coveredRuleCount = factors.length;

  return {
    pagesScanned,
    score,
    tier,
    estimatedExposure: cappedExposure,
    coveredRuleCount,
    totalHighRiskRules,
    factors,
    summary: buildSummary(factors, coveredRuleCount, totalHighRiskRules, pagesScanned, tier),
  };
}

function buildSummary(
  factors: LitigationFactor[],
  covered: number,
  total: number,
  pages: number,
  tier: LitigationTier,
): string {
  if (covered === 0) {
    return `None of the ${total} violation types behind 96% of ADA web lawsuits were found across ${pages} page${pages === 1 ? "" : "s"} — a low litigation surface.`;
  }
  const top = factors[0];
  const tierWord =
    tier === "CRITICAL" ? "severe" : tier === "HIGH" ? "significant" : tier === "MODERATE" ? "moderate" : "limited";
  return `${covered} of the ${total} violation types behind 96% of ADA web lawsuits are present across ${pages} scanned page${pages === 1 ? "" : "s"} — a ${tierWord} litigation surface. Primary driver: ${top.label} on ${top.affectedPages} page${top.affectedPages === 1 ? "" : "s"}.`;
}
