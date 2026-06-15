/**
 * ---------------------------------------------------------
 * RegLayer — Vendor Accessibility Liability Graph (VALG, pure core)
 * ---------------------------------------------------------
 *
 * WHY: A huge share of a site's accessibility violations come from embedded third-party
 *      widgets (chat, consent banners, video, payments) the site owner can't fix directly.
 *      No tool even attributes violations to NAMED vendors, let alone rolls them up across
 *      every site that embeds them. RegLayer's per-scan vendor attribution + multi-tenant
 *      corpus uniquely enables "the Moody's of web-component accessibility": a cross-tenant
 *      liability score per vendor, with regression-over-time tracking.
 *
 * WHAT: Pure functions to aggregate per-(scan,vendor) observations into a cross-tenant
 *       liability ranking, and to detect whether a vendor's injected risk has regressed or
 *       improved between two time periods.
 *
 * HOW: Intentionally PURE — no Prisma, no Next, no "server-only". Recording observations and
 *      querying them live in sibling server modules; this core takes plain data and is
 *      exhaustively unit-testable. The liability score rewards REACH (number of distinct
 *      sites affected) so a mediocre-risk widget embedded everywhere outranks a high-risk
 *      one seen once — that reach is exactly what a single-site competitor cannot measure.
 * ---------------------------------------------------------
 */

export interface VendorObservationInput {
  vendor: string;
  category: string;
  siteId: string | null;
  violationCount: number;
  riskScore: number; // 0–100, from the per-scan vendor scanner
  observedAt: Date;
}

export interface VendorLiabilityScore {
  vendor: string;
  category: string;
  /** Distinct sites that embed this vendor (reach). */
  sitesAffected: number;
  observations: number;
  totalViolations: number;
  avgViolationsPerObservation: number;
  avgRiskScore: number;
  /** 0–100 composite: per-instance risk scaled by cross-site reach. */
  liabilityScore: number;
  lastObservedAt: Date | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Most-frequent value in a list (ties broken by first-seen). */
function mode(values: string[]): string {
  const counts = new Map<string, number>();
  let best = values[0] ?? "";
  let bestN = 0;
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n > bestN) {
      bestN = n;
      best = v;
    }
  }
  return best;
}

/**
 * Composite liability: average per-instance risk scaled up by cross-site reach.
 * reachMultiplier = 1 + log10(sitesAffected)·0.5  → 1 site ×1.0, 10 sites ×1.5, 100 ×2.0.
 * Capped at 100.
 */
export function computeLiabilityScore(avgRiskScore: number, sitesAffected: number): number {
  const reach = Math.max(1, sitesAffected);
  const reachMultiplier = 1 + Math.log10(reach) * 0.5;
  return Math.round(Math.min(100, avgRiskScore * reachMultiplier));
}

/**
 * Aggregate per-(scan,vendor) observations into a cross-tenant liability ranking,
 * highest liability first.
 */
export function aggregateVendorObservations(
  observations: VendorObservationInput[]
): VendorLiabilityScore[] {
  const groups = new Map<string, VendorObservationInput[]>();
  for (const o of observations) {
    const list = groups.get(o.vendor);
    if (list) list.push(o);
    else groups.set(o.vendor, [o]);
  }

  const scores: VendorLiabilityScore[] = [];
  for (const [vendor, list] of groups) {
    const sitesAffected = new Set(list.map((o) => o.siteId).filter((s): s is string => !!s)).size;
    const observationsCount = list.length;
    const totalViolations = list.reduce((sum, o) => sum + o.violationCount, 0);
    const avgRiskScore = round1(list.reduce((sum, o) => sum + o.riskScore, 0) / observationsCount);
    // Reach is at least the number of observations when siteIds are missing.
    const reach = Math.max(sitesAffected, sitesAffected === 0 ? observationsCount : sitesAffected);
    const times = list.map((o) => o.observedAt.getTime());
    scores.push({
      vendor,
      category: mode(list.map((o) => o.category)),
      sitesAffected,
      observations: observationsCount,
      totalViolations,
      avgViolationsPerObservation: round1(totalViolations / observationsCount),
      avgRiskScore,
      liabilityScore: computeLiabilityScore(avgRiskScore, reach),
      lastObservedAt: times.length ? new Date(Math.max(...times)) : null,
    });
  }

  scores.sort((a, b) => b.liabilityScore - a.liabilityScore || b.sitesAffected - a.sitesAffected);
  return scores;
}

// ─────────────── Regression trend ───────────────

export type TrendDirection = "regressed" | "improved" | "stable" | "insufficient-data";

export interface VendorTrend {
  vendor: string;
  priorAvgRiskScore: number | null;
  recentAvgRiskScore: number | null;
  deltaPct: number | null;
  direction: TrendDirection;
  priorCount: number;
  recentCount: number;
}

/** Default change (in avg-risk percentage points) that counts as a real move, not noise. */
export const TREND_THRESHOLD_PCT = 10;

/**
 * Detect whether a single vendor's injected risk regressed or improved across `splitAt`:
 * observations before splitAt form the "prior" baseline, those at/after form "recent".
 * "regressed" means recent avg risk is materially HIGHER than prior (the widget got worse).
 */
export function detectVendorTrend(
  observations: VendorObservationInput[],
  vendor: string,
  splitAt: Date,
  thresholdPct = TREND_THRESHOLD_PCT
): VendorTrend {
  const mine = observations.filter((o) => o.vendor === vendor);
  const prior = mine.filter((o) => o.observedAt.getTime() < splitAt.getTime());
  const recent = mine.filter((o) => o.observedAt.getTime() >= splitAt.getTime());

  const avg = (list: VendorObservationInput[]) =>
    list.length ? round1(list.reduce((s, o) => s + o.riskScore, 0) / list.length) : null;

  const priorAvg = avg(prior);
  const recentAvg = avg(recent);

  if (priorAvg === null || recentAvg === null) {
    return {
      vendor,
      priorAvgRiskScore: priorAvg,
      recentAvgRiskScore: recentAvg,
      deltaPct: null,
      direction: "insufficient-data",
      priorCount: prior.length,
      recentCount: recent.length,
    };
  }

  const delta = recentAvg - priorAvg;
  const direction: TrendDirection =
    delta > thresholdPct ? "regressed" : delta < -thresholdPct ? "improved" : "stable";

  return {
    vendor,
    priorAvgRiskScore: priorAvg,
    recentAvgRiskScore: recentAvg,
    deltaPct: round1(delta),
    direction,
    priorCount: prior.length,
    recentCount: recent.length,
  };
}
