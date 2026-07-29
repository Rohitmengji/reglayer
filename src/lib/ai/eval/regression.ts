/**
 * RegLayer — Evaluation Regression Detection
 *
 * Decides whether a candidate (new prompt version, new model, new retrieval config) may
 * replace a baseline. Pure and deterministic, so the gate itself is testable and a
 * disputed release decision can be reproduced exactly.
 *
 * WHY THIS EXISTS — the existing comparator is unsafe for this product.
 * `experiments/service.ts::analyzeResults` scores latency, cost, and rating at ONE
 * POINT EACH and picks the higher total. Two consequences follow directly:
 *
 *   - A variant that is faster and cheaper beats a variant that is more correct, 2–1.
 *   - CORRECTNESS IS NOT A FACTOR AT ALL. A model that invents WCAG criteria can be
 *     declared the winner, and the report will call that "high confidence".
 *
 * For a compliance assistant that ordering is exactly backwards. A hallucinated success
 * criterion is the one defect that cannot ship, so it is modelled here as a GATE rather
 * than a weighted term — no amount of speed or savings can outvote it.
 *
 * The word "confidence" in that comparator is also a vote margin, not a statistical
 * one. Nothing here claims significance it has not measured; the sample-size rule is
 * stated as evidence sufficiency, not as a p-value.
 *
 * INPUTS: designed to consume the deterministic grader from the golden-dataset work
 * (PR #504) for quality and hallucination, and production lineage/feedback for latency,
 * cost, tokens, and satisfaction.
 */

export interface EvalMetrics {
  /** Number of graded cases or production samples behind these numbers. */
  sampleSize: number;
  /** Deterministic grader score, 0..1. Higher is better. */
  qualityScore: number;
  /** Fraction of responses asserting a criterion that does not exist, 0..1. Lower is better. */
  hallucinationRate: number;
  /** Fraction of citations resolving to a real source, 0..1. Higher is better. */
  citationAccuracy: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  costPerRequestUsd: number;
  tokensPerRequest: number;
  /** Thumbs-up share from production feedback, 0..1. Absent for offline runs. */
  satisfactionRate?: number;
}

export interface RegressionPolicy {
  /** Below this, the comparison is noise rather than evidence. */
  minSampleSize: number;
  /** Fractional drop in quality that blocks. */
  maxQualityDropRatio: number;
  /** Citation accuracy floor, absolute. */
  minCitationAccuracy: number;
  /** Fractional increases that warrant a warning. */
  maxLatencyIncreaseRatio: number;
  maxCostIncreaseRatio: number;
  maxTokenIncreaseRatio: number;
  maxSatisfactionDropRatio: number;
}

export const DEFAULT_POLICY: RegressionPolicy = {
  minSampleSize: 30,
  // Quality moves slowly and noisily; 2% is roughly the smallest drop worth acting on
  // against a 30+ case dataset without generating constant false alarms.
  maxQualityDropRatio: 0.02,
  minCitationAccuracy: 0.95,
  maxLatencyIncreaseRatio: 0.2,
  maxCostIncreaseRatio: 0.15,
  maxTokenIncreaseRatio: 0.15,
  maxSatisfactionDropRatio: 0.05,
};

export type Severity = "blocker" | "warning";

export interface Finding {
  metric: string;
  severity: Severity;
  baseline: number;
  candidate: number;
  message: string;
}

export type Verdict = "pass" | "warn" | "block";

export interface RegressionReport {
  verdict: Verdict;
  findings: Finding[];
  /** One line suitable for a CI annotation. */
  summary: string;
}

/** Relative change, guarding the zero-baseline case where a ratio is undefined. */
function relativeIncrease(baseline: number, candidate: number): number {
  if (baseline <= 0) return candidate > 0 ? Infinity : 0;
  return (candidate - baseline) / baseline;
}

function pct(value: number): string {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "∞";
}

/**
 * Compare a candidate against a baseline.
 *
 * SEVERITY SPLIT: correctness blocks, economics warn. A slower or costlier release is a
 * trade-off a human can knowingly accept; a less correct one is not a trade-off at all
 * in a product whose output is used for regulatory evidence.
 */
export function detectRegressions(
  baseline: EvalMetrics,
  candidate: EvalMetrics,
  policy: RegressionPolicy = DEFAULT_POLICY,
): RegressionReport {
  const findings: Finding[] = [];

  // ── Evidence sufficiency ───────────────────────────────────────────────────
  // Deliberately a BLOCKER. An automated gate that passes when it has no evidence is
  // not a gate — it is a rubber stamp that reports green.
  if (candidate.sampleSize < policy.minSampleSize) {
    findings.push({
      metric: "sampleSize",
      severity: "blocker",
      baseline: baseline.sampleSize,
      candidate: candidate.sampleSize,
      message:
        `Only ${candidate.sampleSize} samples (need ${policy.minSampleSize}). ` +
        "Not enough evidence to tell a real change from noise.",
    });
  }

  // ── Hallucination: absolute gate ───────────────────────────────────────────
  // ANY increase blocks. Expressed absolutely rather than as a ratio because going
  // from 0% to 2% is infinitely worse in ratio terms and must not depend on that
  // arithmetic to be caught.
  if (candidate.hallucinationRate > baseline.hallucinationRate) {
    findings.push({
      metric: "hallucinationRate",
      severity: "blocker",
      baseline: baseline.hallucinationRate,
      candidate: candidate.hallucinationRate,
      message:
        `Hallucination rose from ${pct(baseline.hallucinationRate)} to ${pct(candidate.hallucinationRate)}. ` +
        "A fabricated criterion cannot appear in compliance evidence, so no latency or cost gain offsets this.",
    });
  }

  // ── Quality ────────────────────────────────────────────────────────────────
  const qualityDrop = -relativeIncrease(baseline.qualityScore, candidate.qualityScore);
  if (qualityDrop > policy.maxQualityDropRatio) {
    findings.push({
      metric: "qualityScore",
      severity: "blocker",
      baseline: baseline.qualityScore,
      candidate: candidate.qualityScore,
      message: `Quality fell ${pct(qualityDrop)} (limit ${pct(policy.maxQualityDropRatio)}).`,
    });
  }

  // ── Citations ──────────────────────────────────────────────────────────────
  // An absolute floor, not a delta: a citation that does not resolve is wrong
  // regardless of whether the previous version was equally wrong.
  if (candidate.citationAccuracy < policy.minCitationAccuracy) {
    findings.push({
      metric: "citationAccuracy",
      severity: "blocker",
      baseline: baseline.citationAccuracy,
      candidate: candidate.citationAccuracy,
      message:
        `Citation accuracy ${pct(candidate.citationAccuracy)} is below the ` +
        `${pct(policy.minCitationAccuracy)} floor.`,
    });
  }

  // ── Economics: warnings ────────────────────────────────────────────────────
  const economic: { metric: keyof EvalMetrics; limit: number; label: string }[] = [
    { metric: "p95LatencyMs", limit: policy.maxLatencyIncreaseRatio, label: "p95 latency" },
    { metric: "costPerRequestUsd", limit: policy.maxCostIncreaseRatio, label: "cost per request" },
    { metric: "tokensPerRequest", limit: policy.maxTokenIncreaseRatio, label: "tokens per request" },
  ];

  for (const { metric, limit, label } of economic) {
    const before = baseline[metric] as number;
    const after = candidate[metric] as number;
    const increase = relativeIncrease(before, after);
    if (increase > limit) {
      findings.push({
        metric: metric as string,
        severity: "warning",
        baseline: before,
        candidate: after,
        message: `${label} rose ${pct(increase)} (limit ${pct(limit)}).`,
      });
    }
  }

  // ── Satisfaction ───────────────────────────────────────────────────────────
  // A warning, not a blocker: thumbs data is sparse, self-selected, and lags a release,
  // so treating it as a gate would block on a signal that has not stabilised.
  if (baseline.satisfactionRate !== undefined && candidate.satisfactionRate !== undefined) {
    const drop = -relativeIncrease(baseline.satisfactionRate, candidate.satisfactionRate);
    if (drop > policy.maxSatisfactionDropRatio) {
      findings.push({
        metric: "satisfactionRate",
        severity: "warning",
        baseline: baseline.satisfactionRate,
        candidate: candidate.satisfactionRate,
        message: `User satisfaction fell ${pct(drop)} (limit ${pct(policy.maxSatisfactionDropRatio)}).`,
      });
    }
  }

  const blockers = findings.filter((f) => f.severity === "blocker");
  const verdict: Verdict = blockers.length > 0 ? "block" : findings.length > 0 ? "warn" : "pass";

  const summary =
    verdict === "pass"
      ? `PASS — no regressions across ${candidate.sampleSize} samples.`
      : verdict === "warn"
        ? `WARN — ${findings.length} non-blocking regression(s): ${findings.map((f) => f.metric).join(", ")}.`
        : `BLOCK — ${blockers.length} blocking regression(s): ${blockers.map((f) => f.metric).join(", ")}.`;

  return { verdict, findings, summary };
}

/** Convenience for CI: non-zero exit when the candidate must not ship. */
export function exitCodeFor(report: RegressionReport): number {
  return report.verdict === "block" ? 1 : 0;
}
