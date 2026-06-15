/**
 * ---------------------------------------------------------
 * RegLayer — Fix Genome (pure core)
 * ---------------------------------------------------------
 *
 * WHY: Every accessibility tool emits the same generic, static fix text from axe's help
 *      output and never learns whether a given fix actually worked in production. RegLayer
 *      uniquely owns the three signals needed to learn: the fix, the re-scan that verifies
 *      it, and (optionally) the RUM barrier-drop that confirms it for real users. Joined
 *      across tenants, that becomes "for this barrier, this fix works X% of the time, median
 *      Y days to take effect" — a network-effect dataset a single-site tool cannot build.
 *
 * WHAT: Pure functions to (a) normalize a violation into a stable structural fingerprint,
 *       (b) aggregate recorded fix outcomes into per-rule / per-fingerprint success stats,
 *       and (c) turn those stats into a confidence-rated recommendation.
 *
 * HOW: Intentionally PURE — no Prisma, no Next, no "server-only". Recording outcomes and
 *      querying them live in sibling server modules; this core takes plain data and is
 *      exhaustively unit-testable.
 * ---------------------------------------------------------
 */

// ─────────────── Fingerprinting ───────────────

/**
 * Reduce a concrete CSS selector to a stable STRUCTURAL fingerprint so the same barrier
 * on different pages/instances groups together: positional pseudo-classes are dropped,
 * ids and attribute values are genericized, and digit runs are collapsed.
 *
 *   "#user-42 > div:nth-child(3) .btn[data-x='9']"  →  "#id > div .btn[attr]"
 */
export function normalizeSelector(selector: string | null | undefined): string {
  if (!selector) return "*";
  let s = selector.trim().toLowerCase();
  s = s.replace(/:nth-(child|of-type|last-child|last-of-type)\([^)]*\)/g, "");
  s = s.replace(/#[a-z0-9_-]+/g, "#id");
  s = s.replace(/\[[^\]]*\]/g, "[attr]");
  s = s.replace(/\d+/g, "n");
  s = s.replace(/\s+/g, " ").trim();
  return s || "*";
}

/** A stable per-barrier key: ruleId + the normalized structural selector. */
export function computeFingerprint(ruleId: string, selector?: string | null): string {
  return `${ruleId}::${normalizeSelector(selector)}`;
}

// ─────────────── Aggregation ───────────────

export interface FixOutcome {
  ruleId: string;
  fingerprint: string;
  success: boolean;
  /** Days from detection to confirmed fix; null when unknown. */
  daysToEffect: number | null;
  verifiedAt: Date;
  verifiedVia?: string;
}

export type GroupBy = "rule" | "fingerprint";

export interface GenomeAggregate {
  /** Grouping key — a ruleId (by="rule") or a fingerprint (by="fingerprint"). */
  key: string;
  ruleId: string;
  attempts: number;
  successes: number;
  /** Success rate as a 0–100 percentage, 1 decimal. */
  successRate: number;
  /** Median days-to-effect across SUCCESSFUL outcomes with a known duration; null if none. */
  medianDaysToEffect: number | null;
  lastObservedAt: Date | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Aggregate recorded outcomes into per-group success statistics, sorted by success rate
 * (then sample size) descending — best-performing, best-evidenced fixes first.
 */
export function aggregateOutcomes(
  outcomes: FixOutcome[],
  opts?: { by?: GroupBy }
): GenomeAggregate[] {
  const by = opts?.by ?? "rule";
  const groups = new Map<string, FixOutcome[]>();
  for (const o of outcomes) {
    const key = by === "rule" ? o.ruleId : o.fingerprint;
    const list = groups.get(key);
    if (list) list.push(o);
    else groups.set(key, [o]);
  }

  const aggregates: GenomeAggregate[] = [];
  for (const [key, list] of groups) {
    const attempts = list.length;
    const successes = list.filter((o) => o.success).length;
    const successDurations = list
      .filter((o) => o.success && o.daysToEffect !== null && o.daysToEffect >= 0)
      .map((o) => o.daysToEffect as number)
      .sort((a, b) => a - b);
    const times = list.map((o) => o.verifiedAt.getTime());
    aggregates.push({
      key,
      ruleId: list[0].ruleId,
      attempts,
      successes,
      successRate: attempts ? round1((100 * successes) / attempts) : 0,
      medianDaysToEffect: successDurations.length ? round1(median(successDurations)) : null,
      lastObservedAt: times.length ? new Date(Math.max(...times)) : null,
    });
  }

  aggregates.sort((a, b) => b.successRate - a.successRate || b.attempts - a.attempts);
  return aggregates;
}

// ─────────────── Recommendation ───────────────

export type Confidence = "high" | "medium" | "low" | "insufficient";

export interface Recommendation {
  ruleId: string;
  found: boolean;
  attempts: number;
  successes: number;
  successRate: number;
  medianDaysToEffect: number | null;
  confidence: Confidence;
  /** Human-readable, evidence-grounded recommendation line. */
  message: string;
}

/** Sample-size thresholds for confidence in a success-rate estimate. */
export const CONFIDENCE_THRESHOLDS = { high: 10, medium: 4, low: 1 } as const;

function confidenceFor(attempts: number): Confidence {
  if (attempts >= CONFIDENCE_THRESHOLDS.high) return "high";
  if (attempts >= CONFIDENCE_THRESHOLDS.medium) return "medium";
  if (attempts >= CONFIDENCE_THRESHOLDS.low) return "low";
  return "insufficient";
}

/**
 * Recommend a fix for a rule from the aggregated genome. Picks the best-performing
 * aggregate whose ruleId matches and reports it with a confidence rating grounded in the
 * number of observed outcomes (so a 100%-of-1 result is never dressed up as certainty).
 */
export function recommendForRule(ruleId: string, aggregates: GenomeAggregate[]): Recommendation {
  // aggregates are pre-sorted best-first; take the first matching this rule.
  const agg = aggregates.find((a) => a.ruleId === ruleId);
  if (!agg || agg.attempts === 0) {
    return {
      ruleId,
      found: false,
      attempts: 0,
      successes: 0,
      successRate: 0,
      medianDaysToEffect: null,
      confidence: "insufficient",
      message: `No recorded fix outcomes for "${ruleId}" yet — recommendation will improve as remediations are verified.`,
    };
  }

  const confidence = confidenceFor(agg.attempts);
  const durationPart =
    agg.medianDaysToEffect !== null ? `, median ${agg.medianDaysToEffect} day(s) to take effect` : "";
  const message =
    confidence === "insufficient"
      ? `Only ${agg.attempts} recorded outcome(s) for "${ruleId}" — insufficient evidence for a confident recommendation.`
      : `Across ${agg.attempts} recorded remediation(s) of "${ruleId}", verified fixes succeeded ${agg.successRate}% of the time${durationPart} (${confidence} confidence).`;

  return {
    ruleId,
    found: true,
    attempts: agg.attempts,
    successes: agg.successes,
    successRate: agg.successRate,
    medianDaysToEffect: agg.medianDaysToEffect,
    confidence,
    message,
  };
}
