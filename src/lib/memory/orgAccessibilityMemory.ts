/**
 * RegLayer — Organizational Accessibility Memory (institutional recall)
 *
 * THE IDEA: the platform already RECORDS every verified fix outcome (Fix Genome,
 * fix_outcomes). This layer turns that history into INSTITUTIONAL MEMORY — so when
 * a familiar violation reappears, the AI can say:
 *
 *   "Your team fixed this exact issue on `header > nav .btn` 4 times before,
 *    resolving it 84% of the time (median 2 days). Reuse that implementation?"
 *
 * WHY IT'S A MOAT: the recall is grounded in the ORGANISATION'S OWN verified
 * outcomes. A competitor starting fresh has no history — this compounds with use.
 *
 * DESIGN:
 *   - PURE core (`buildFixRecall`) — deterministic, unit-tested, no DB.
 *   - Reuses the Fix Genome primitives instead of a parallel store:
 *       computeFingerprint / normalizeSelector / aggregateOutcomes / confidence.
 *   - `fingerprint` (ruleId + normalized selector) IS the component identity, so
 *     recall is precise to the component, not just the rule.
 *   - Storage access is defensive: if fix_outcomes isn't provisioned, recall
 *     degrades to "no precedent yet" rather than throwing.
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { firstSelector } from "@/lib/genome/recordOutcome";
import {
  aggregateOutcomes,
  computeFingerprint,
  normalizeSelector,
  CONFIDENCE_THRESHOLDS,
  type FixOutcome,
  type GenomeAggregate,
  type Confidence,
} from "@/lib/genome/fixGenome";

// ── Types ───────────────────────────────────────────────────────────────────

export interface RecallEvidence {
  attempts: number;
  successes: number;
  /** Share of recorded fixes that eliminated the rule (0–100). */
  successRate: number;
  medianDaysToEffect: number | null;
  lastObservedAt: string | null;
}

export interface FixRecall {
  ruleId: string;
  /** Structural component signature — the "where" (e.g. "header > nav .btn"). */
  component: string;
  fingerprint: string;
  /** True when the org has verified at least one prior fix for this rule. */
  hasPrecedent: boolean;
  confidence: Confidence;
  /** Precedent on THIS exact component (most relevant), if any. */
  onThisComponent: RecallEvidence | null;
  /** Precedent for this rule anywhere in the org (broader). */
  acrossOrg: RecallEvidence | null;
  /** Distinct components where this rule was successfully fixed. */
  componentsFixedCount: number;
  /** Natural-language reuse suggestion, grounded in the evidence. */
  suggestion: string;
}

// ── Pure core ───────────────────────────────────────────────────────────────

function confidenceFor(attempts: number): Confidence {
  if (attempts >= CONFIDENCE_THRESHOLDS.high) return "high";
  if (attempts >= CONFIDENCE_THRESHOLDS.medium) return "medium";
  if (attempts >= CONFIDENCE_THRESHOLDS.low) return "low";
  return "insufficient";
}

function toEvidence(agg: GenomeAggregate | null): RecallEvidence | null {
  if (!agg || agg.attempts === 0) return null;
  return {
    attempts: agg.attempts,
    successes: agg.successes,
    successRate: agg.successRate,
    medianDaysToEffect: agg.medianDaysToEffect,
    lastObservedAt: agg.lastObservedAt ? agg.lastObservedAt.toISOString() : null,
  };
}

function durationClause(median: number | null): string {
  return median !== null ? ` (median ${median} day${median === 1 ? "" : "s"} to take effect)` : "";
}

/**
 * Build an institutional-memory recall for one violation from pre-aggregated
 * genome evidence. Pure and deterministic.
 */
export function buildFixRecall(input: {
  ruleId: string;
  component: string;
  fingerprint: string;
  componentAgg: GenomeAggregate | null;
  ruleAgg: GenomeAggregate | null;
  componentsFixedCount: number;
}): FixRecall {
  const { ruleId, component, fingerprint, componentAgg, ruleAgg, componentsFixedCount } = input;

  const onThisComponent = toEvidence(componentAgg);
  const acrossOrg = toEvidence(ruleAgg);
  // Confidence is grounded in the strongest evidence available.
  const bestAttempts = Math.max(componentAgg?.attempts ?? 0, ruleAgg?.attempts ?? 0);
  const confidence = confidenceFor(bestAttempts);
  const hasPrecedent = (componentAgg?.successes ?? 0) > 0 || (ruleAgg?.successes ?? 0) > 0;

  return {
    ruleId,
    component,
    fingerprint,
    hasPrecedent,
    confidence,
    onThisComponent,
    acrossOrg,
    componentsFixedCount,
    suggestion: buildSuggestion(ruleId, component, onThisComponent, acrossOrg, componentsFixedCount, confidence),
  };
}

function buildSuggestion(
  ruleId: string,
  component: string,
  onThisComponent: RecallEvidence | null,
  acrossOrg: RecallEvidence | null,
  componentsFixedCount: number,
  confidence: Confidence,
): string {
  // Precise, same-component precedent is the strongest recall.
  if (onThisComponent && onThisComponent.successes > 0) {
    return (
      `Your team has fixed \`${ruleId}\` on \`${component}\` ${onThisComponent.attempts} ` +
      `time${onThisComponent.attempts === 1 ? "" : "s"} before, resolving it ${onThisComponent.successRate}% ` +
      `of the time${durationClause(onThisComponent.medianDaysToEffect)}. Reuse that implementation?`
    );
  }
  // Fall back to org-wide precedent for the same rule.
  if (acrossOrg && acrossOrg.successes > 0) {
    const where = componentsFixedCount > 0
      ? ` across ${componentsFixedCount} component${componentsFixedCount === 1 ? "" : "s"}`
      : "";
    const hedge = confidence === "insufficient" || confidence === "low" ? " (limited evidence)" : "";
    return (
      `Your team has resolved \`${ruleId}\` ${acrossOrg.successRate}% of the time${where}` +
      `${durationClause(acrossOrg.medianDaysToEffect)}${hedge}. Apply the same approach on \`${component}\`?`
    );
  }
  return `No verified fixes recorded for \`${ruleId}\` yet — this becomes recallable once a fix is confirmed.`;
}

// ── DB layer ────────────────────────────────────────────────────────────────

/** Load a workspace's fix outcomes (defensive — empty if table unprovisioned). */
async function loadWorkspaceOutcomes(
  workspaceId: string,
  ruleId?: string,
): Promise<FixOutcome[]> {
  try {
    const rows = await prisma.fixOutcomeRecord.findMany({
      where: { workspaceId, ...(ruleId ? { ruleId } : {}) },
      orderBy: { verifiedAt: "desc" },
      take: 5000,
      select: { ruleId: true, fingerprint: true, success: true, daysToEffect: true, verifiedAt: true, verifiedVia: true },
    });
    return rows.map((r) => ({
      ruleId: r.ruleId,
      fingerprint: r.fingerprint,
      success: r.success,
      daysToEffect: r.daysToEffect,
      verifiedAt: r.verifiedAt,
      verifiedVia: r.verifiedVia,
    }));
  } catch {
    return []; // fix_outcomes not migrated — degrade to "no precedent"
  }
}

/** Count distinct components (fingerprints) where a rule was successfully fixed. */
function countComponentsFixed(fingerprintAggs: GenomeAggregate[], ruleId: string): number {
  return fingerprintAggs.filter((a) => a.ruleId === ruleId && a.successes > 0).length;
}

function recallFrom(
  outcomes: FixOutcome[],
  ruleId: string,
  fingerprint: string,
  component: string,
): FixRecall {
  const fingerprintAggs = aggregateOutcomes(outcomes, { by: "fingerprint" });
  const ruleAggs = aggregateOutcomes(outcomes, { by: "rule" });
  return buildFixRecall({
    ruleId,
    component,
    fingerprint,
    componentAgg: fingerprintAggs.find((a) => a.key === fingerprint) ?? null,
    ruleAgg: ruleAggs.find((a) => a.ruleId === ruleId) ?? null,
    componentsFixedCount: countComponentsFixed(fingerprintAggs, ruleId),
  });
}

/**
 * Recall institutional fix history for a specific violation. The AI's
 * "we've solved this before" prompt.
 */
export async function recallFixForViolation(
  workspaceId: string,
  violationId: string,
): Promise<FixRecall | null> {
  const violation = await prisma.violation.findFirst({
    where: { id: violationId, scan: { workspaceId } },
    select: { ruleId: true, affectedElements: true },
  });
  if (!violation) return null;

  const selector = firstSelector(violation.affectedElements);
  const component = normalizeSelector(selector);
  const fingerprint = computeFingerprint(violation.ruleId, selector);

  const outcomes = await loadWorkspaceOutcomes(workspaceId, violation.ruleId);
  return recallFrom(outcomes, violation.ruleId, fingerprint, component);
}

/** Recall from an explicit rule + selector (e.g. a live scan result, no row yet). */
export async function recallFixForRuleSelector(
  workspaceId: string,
  ruleId: string,
  selector: string | null,
): Promise<FixRecall> {
  const component = normalizeSelector(selector);
  const fingerprint = computeFingerprint(ruleId, selector);
  const outcomes = await loadWorkspaceOutcomes(workspaceId, ruleId);
  return recallFrom(outcomes, ruleId, fingerprint, component);
}

/**
 * For a whole scan, surface only the OPEN violations the org has fixed before —
 * so the AI can proactively offer to reuse proven implementations. Loads all
 * workspace outcomes once and matches in memory.
 */
export async function recallForScan(
  scanId: string,
  workspaceId: string,
  opts?: { limit?: number },
): Promise<FixRecall[]> {
  const scan = await prisma.scan.findFirst({
    where: { id: scanId, workspaceId },
    select: {
      violations: {
        where: { status: "OPEN" },
        select: { ruleId: true, affectedElements: true },
      },
    },
  });
  if (!scan) return [];

  const outcomes = await loadWorkspaceOutcomes(workspaceId);
  const fingerprintAggs = aggregateOutcomes(outcomes, { by: "fingerprint" });
  const ruleAggs = aggregateOutcomes(outcomes, { by: "rule" });

  // Deduplicate violations by fingerprint so we recall each component once.
  const seen = new Set<string>();
  const recalls: FixRecall[] = [];
  for (const v of scan.violations) {
    const selector = firstSelector(v.affectedElements);
    const component = normalizeSelector(selector);
    const fingerprint = computeFingerprint(v.ruleId, selector);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    const recall = buildFixRecall({
      ruleId: v.ruleId,
      component,
      fingerprint,
      componentAgg: fingerprintAggs.find((a) => a.key === fingerprint) ?? null,
      ruleAgg: ruleAggs.find((a) => a.ruleId === v.ruleId) ?? null,
      componentsFixedCount: countComponentsFixed(fingerprintAggs, v.ruleId),
    });
    if (recall.hasPrecedent) recalls.push(recall);
  }

  // Strongest, best-evidenced precedents first.
  const rank: Record<Confidence, number> = { high: 3, medium: 2, low: 1, insufficient: 0 };
  recalls.sort((a, b) => {
    const byConf = rank[b.confidence] - rank[a.confidence];
    if (byConf !== 0) return byConf;
    return (b.onThisComponent?.successRate ?? b.acrossOrg?.successRate ?? 0)
      - (a.onThisComponent?.successRate ?? a.acrossOrg?.successRate ?? 0);
  });

  return recalls.slice(0, opts?.limit ?? 20);
}
