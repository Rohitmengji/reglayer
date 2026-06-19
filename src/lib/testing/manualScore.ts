/**
 * WHY: Manual test verdicts need to produce a numeric score that integrates with
 *      the existing automatedScore for a combined conformance picture.
 * WHAT: Pure rollupManualScore() and combineScores() — no Prisma, no server imports.
 * HOW: manualScore = % of evaluated criteria that pass. combinedScore = weighted average
 *      of automated and manual scores based on criteria coverage counts.
 */

import type { ManualTestItem, ManualVerdict } from "./manualTestPlan";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ManualScoreRollup {
  /** 0–100: percentage of evaluated manual criteria that pass */
  score: number;
  /** Count of items by verdict */
  counts: {
    pass: number;
    fail: number;
    na: number;
    untested: number;
    total: number;
  };
  /** Number of evaluated items (pass + fail, excluding na/untested) */
  evaluated: number;
}

export interface CombinedScoreResult {
  /** 0–100: weighted combination of automated + manual */
  combinedScore: number;
  /** Breakdown for transparency */
  breakdown: {
    automatedScore: number;
    automatedCriteriaCount: number;
    manualScore: number;
    manualCriteriaEvaluated: number;
    totalCriteriaAA: number;
  };
}

// ── Score rollup ──────────────────────────────────────────────────────────────

/**
 * Computes manual test score from verdict items.
 * Score = (pass / (pass + fail)) * 100
 * NA and untested items are excluded from the denominator.
 * Returns 0 if nothing is evaluated yet.
 */
export function rollupManualScore(items: ManualTestItem[]): ManualScoreRollup {
  const counts = { pass: 0, fail: 0, na: 0, untested: 0, total: items.length };

  for (const item of items) {
    counts[item.verdict]++;
  }

  const evaluated = counts.pass + counts.fail;
  const score = evaluated > 0 ? Math.round((counts.pass / evaluated) * 100) : 0;

  return { score, counts, evaluated };
}

/**
 * Combines automated and manual scores into a single conformance score.
 * Uses criteria-count weighting: each score contributes proportionally to
 * how many criteria it covers.
 *
 * Formula:
 *   combinedScore = (auto * autoCriteria + manual * manualEvaluated) / (autoCriteria + manualEvaluated)
 *
 * If either score has zero criteria evaluated, the other dominates.
 * Total A/AA criteria = 52 (from WCAG_CRITERIA).
 */
export function combineScores(
  automatedScore: number,
  automatedCriteriaCount: number,
  manualRollup: ManualScoreRollup,
): CombinedScoreResult {
  const manualScore = manualRollup.score;
  const manualEvaluated = manualRollup.evaluated;
  const totalWeight = automatedCriteriaCount + manualEvaluated;

  let combinedScore: number;

  if (totalWeight === 0) {
    // Nothing evaluated at all
    combinedScore = 0;
  } else if (manualEvaluated === 0) {
    // Only automated data
    combinedScore = automatedScore;
  } else if (automatedCriteriaCount === 0) {
    // Only manual data
    combinedScore = manualScore;
  } else {
    // Weighted average
    combinedScore = Math.round(
      (automatedScore * automatedCriteriaCount + manualScore * manualEvaluated) / totalWeight
    );
  }

  return {
    combinedScore,
    breakdown: {
      automatedScore,
      automatedCriteriaCount,
      manualScore,
      manualCriteriaEvaluated: manualEvaluated,
      totalCriteriaAA: 52,
    },
  };
}
