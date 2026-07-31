/**
 * RegLayer — Accessibility Regression DNA
 *
 * Don't compare scans — compare EVOLUTION. Every violation fingerprint
 * (rule + structural component) has a life story:
 *
 *   first appeared → fixed → returned → returned again → ...
 *
 * This module reconstructs that lineage from scan history and, from the pattern,
 * PREDICTS what is most likely to break next sprint — so teams can pre-empt the
 * regressions that keep coming back instead of firefighting them.
 *
 * DESIGN:
 *   - PURE core (`buildRegressionDNA`, `predictRegressions`) — deterministic,
 *     unit-tested, no DB.
 *   - Reuses the existing fingerprint identity (computeFingerprint / normalizeSelector)
 *     and the fixability taxonomy for root-cause inference — no parallel concepts.
 *   - The predictor is a transparent, defensible model (recurrence × fix-survival
 *     vs sprint length), never a black box, and it hedges on thin evidence.
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { firstSelector } from "@/lib/genome/recordOutcome";
import { computeFingerprint, normalizeSelector } from "@/lib/genome/fixGenome";
import { FIXABLE_RULES } from "@/lib/remediation/fixability";

// ── Types ───────────────────────────────────────────────────────────────────

export type LifecycleEventType = "appeared" | "fixed" | "returned";

export interface LifecycleEvent {
  type: LifecycleEventType;
  at: string; // ISO
}

export type RegressionState = "open" | "fixed";

export interface RegressionDNA {
  fingerprint: string;
  ruleId: string;
  component: string;
  rootCause: string;
  firstAppearedAt: string;
  currentState: RegressionState;
  scansAnalyzed: number;
  presentScans: number;
  /** Times the violation was resolved (present → absent). */
  fixes: number;
  /** Times it came back after being fixed (the regressions). */
  returns: number;
  /** Fraction of scan-to-scan transitions where state flipped (0–1). */
  volatility: number;
  /** Mean days a fix survived before the violation returned; null if never. */
  meanFixSurvivalDays: number | null;
  lastFixedAt: string | null;
  lastReturnedAt: string | null;
  daysSinceLastChange: number | null;
  /** Returned 2+ times — a chronic, recurring barrier. */
  chronic: boolean;
  events: LifecycleEvent[];
}

export interface RegressionPrediction {
  fingerprint: string;
  ruleId: string;
  component: string;
  rootCause: string;
  currentState: RegressionState;
  /** Probability this regresses within the sprint window (0–1). */
  probability: number;
  /** Estimated days until the next regression; null if unknown. */
  expectedDaysToRegress: number | null;
  confidence: "high" | "medium" | "low";
  reason: string;
}

export interface ScanPresencePoint {
  completedAt: Date;
  present: boolean;
}

// ── Root-cause inference ────────────────────────────────────────────────────

const CATEGORY_ROOT_CAUSE: Record<string, string> = {
  "alt-text": "content-value drift (markup restored without the text)",
  "form-labels": "content-value drift (fields relabelled without an accessible name)",
  "button-labels": "content-value drift (controls rebuilt without a name)",
  contrast: "design-system drift (tokens/theme changed)",
  landmarks: "structural markup regression (layout refactor)",
  "lang-attribute": "structural markup regression (document shell changed)",
  "skip-links": "structural markup regression (navigation refactor)",
  "focus-order": "interaction regression (tab order altered)",
};

export function inferRootCause(ruleId: string): string {
  const category = FIXABLE_RULES[ruleId];
  return (category && CATEGORY_ROOT_CAUSE[category]) ?? "unclassified (needs developer triage)";
}

// ── Pure lineage reconstruction ─────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
const DAY_MS = 86_400_000;

/**
 * Reconstruct a fingerprint's regression DNA from its chronological presence
 * across scans. `points` must be oldest-first. Returns null if the fingerprint
 * never appeared in the window.
 */
export function buildRegressionDNA(
  fingerprint: string,
  ruleId: string,
  component: string,
  points: ScanPresencePoint[],
  now: Date = new Date(),
): RegressionDNA | null {
  if (points.length === 0) return null;

  const events: LifecycleEvent[] = [];
  let everPresent = false;
  let prev: boolean | null = null;
  let transitions = 0;
  let presentScans = 0;
  let fixes = 0;
  let returns = 0;
  let firstAppearedAt: Date | null = null;
  let lastFixedAt: Date | null = null;
  let lastReturnedAt: Date | null = null;
  let lastChangeAt: Date | null = null;
  const survivals: number[] = [];

  for (const p of points) {
    if (p.present) presentScans++;

    if (prev !== null && p.present !== prev) {
      transitions++;
      lastChangeAt = p.completedAt;
    }

    if (p.present && prev !== true) {
      if (!everPresent) {
        everPresent = true;
        firstAppearedAt = p.completedAt;
        events.push({ type: "appeared", at: p.completedAt.toISOString() });
      } else {
        returns++;
        lastReturnedAt = p.completedAt;
        events.push({ type: "returned", at: p.completedAt.toISOString() });
        if (lastFixedAt) survivals.push((p.completedAt.getTime() - lastFixedAt.getTime()) / DAY_MS);
      }
    } else if (!p.present && prev === true) {
      fixes++;
      lastFixedAt = p.completedAt;
      events.push({ type: "fixed", at: p.completedAt.toISOString() });
    }

    prev = p.present;
  }

  if (!everPresent || !firstAppearedAt) return null;

  const currentState: RegressionState = prev === true ? "open" : "fixed";
  const volatility = points.length > 1 ? round1(transitions / (points.length - 1)) : 0;
  const meanFixSurvivalDays = survivals.length
    ? round1(survivals.reduce((a, b) => a + b, 0) / survivals.length)
    : null;
  const daysSinceLastChange = lastChangeAt
    ? Math.max(0, Math.round((now.getTime() - lastChangeAt.getTime()) / DAY_MS))
    : null;

  return {
    fingerprint,
    ruleId,
    component,
    rootCause: inferRootCause(ruleId),
    firstAppearedAt: firstAppearedAt.toISOString(),
    currentState,
    scansAnalyzed: points.length,
    presentScans,
    fixes,
    returns,
    volatility,
    meanFixSurvivalDays,
    lastFixedAt: lastFixedAt ? lastFixedAt.toISOString() : null,
    lastReturnedAt: lastReturnedAt ? lastReturnedAt.toISOString() : null,
    daysSinceLastChange,
    chronic: returns >= 2,
    events,
  };
}

// ── Pure prediction ─────────────────────────────────────────────────────────

const DEFAULT_SPRINT_DAYS = 14;

function confidenceFor(fixes: number): RegressionPrediction["confidence"] {
  if (fixes >= 4) return "high";
  if (fixes >= 2) return "medium";
  return "low";
}

/**
 * Predict which fingerprints will regress within the sprint window.
 *
 * Model (transparent): a fixed-then-returned pattern is the signal. The per-fix
 * regression rate (returns / fixes) is scaled by a timing factor — fixes that
 * historically survive LESS than a sprint are likelier to break again soon.
 * Currently-open chronic barriers are surfaced too (they will re-break after the
 * next fix) but ranked below imminent regressions.
 */
export function predictRegressions(
  dnas: RegressionDNA[],
  opts?: { sprintDays?: number; limit?: number },
): RegressionPrediction[] {
  const sprintDays = opts?.sprintDays ?? DEFAULT_SPRINT_DAYS;
  const predictions: RegressionPrediction[] = [];

  for (const d of dnas) {
    if (d.returns === 0 || d.fixes === 0) continue; // no regression history → not predicted

    const perFixRate = Math.min(1, d.returns / d.fixes);

    // Timing: shorter historical survival than a sprint → amplify; longer → damp.
    let timingFactor = 1;
    let expectedDaysToRegress: number | null = null;
    if (d.meanFixSurvivalDays !== null && d.meanFixSurvivalDays > 0) {
      timingFactor = clamp(sprintDays / d.meanFixSurvivalDays, 0.3, 1.5);
      if (d.currentState === "fixed" && d.daysSinceLastChange !== null) {
        expectedDaysToRegress = Math.max(0, Math.round(d.meanFixSurvivalDays - d.daysSinceLastChange));
      }
    }

    // Open barriers can't "regress" until re-fixed — discount their imminence.
    const stateFactor = d.currentState === "fixed" ? 1 : 0.5;
    const probability = round2(clamp(perFixRate * timingFactor * stateFactor, 0, 0.95));

    predictions.push({
      fingerprint: d.fingerprint,
      ruleId: d.ruleId,
      component: d.component,
      rootCause: d.rootCause,
      currentState: d.currentState,
      probability,
      expectedDaysToRegress,
      confidence: confidenceFor(d.fixes),
      reason: buildReason(d, expectedDaysToRegress, sprintDays),
    });
  }

  predictions.sort((a, b) => b.probability - a.probability);
  return predictions.slice(0, opts?.limit ?? 20);
}

function buildReason(d: RegressionDNA, expectedDays: number | null, sprintDays: number): string {
  const survival = d.meanFixSurvivalDays !== null ? `fixes lasted ~${d.meanFixSurvivalDays}d on average` : "survival time unknown";
  const eta =
    d.currentState === "fixed" && expectedDays !== null
      ? expectedDays <= sprintDays
        ? ` — expected to return in ~${expectedDays}d (within the sprint)`
        : ` — next return estimated ~${expectedDays}d out`
      : d.currentState === "open"
        ? " — currently open; will recur unless the root cause is addressed"
        : "";
  return `Regressed ${d.returns}× across ${d.fixes} fix${d.fixes === 1 ? "" : "es"}; ${survival}${eta}. Root cause: ${d.rootCause}.`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── DB layer ────────────────────────────────────────────────────────────────

interface FingerprintMeta {
  ruleId: string;
  component: string;
}

/**
 * Compute regression DNA + next-sprint predictions for a site (or URL) from its
 * scan history. Loads the window once and reconstructs each fingerprint's lineage
 * across every scan.
 */
export async function computeSiteRegressionDNA(
  workspaceId: string,
  opts: { siteId?: string; url?: string; maxScans?: number; sprintDays?: number; limit?: number },
): Promise<{ scansAnalyzed: number; dna: RegressionDNA[]; predictions: RegressionPrediction[] }> {
  const scans = await prisma.scan.findMany({
    where: {
      workspaceId,
      status: "COMPLETED",
      completedAt: { not: null },
      ...(opts.siteId ? { siteId: opts.siteId } : {}),
      ...(opts.url ? { url: opts.url } : {}),
    },
    orderBy: { completedAt: "asc" },
    take: opts.maxScans ?? 60,
    select: {
      completedAt: true,
      violations: { select: { ruleId: true, affectedElements: true } },
    },
  });

  const points = scans.filter((s) => s.completedAt) as Array<{ completedAt: Date; violations: Array<{ ruleId: string; affectedElements: unknown }> }>;
  if (points.length === 0) return { scansAnalyzed: 0, dna: [], predictions: [] };

  // Presence of each fingerprint at each scan + metadata from first sighting.
  const meta = new Map<string, FingerprintMeta>();
  const presenceByScan: Array<{ completedAt: Date; present: Set<string> }> = [];

  for (const s of points) {
    const present = new Set<string>();
    for (const v of s.violations) {
      const selector = firstSelector(v.affectedElements);
      const fingerprint = computeFingerprint(v.ruleId, selector);
      present.add(fingerprint);
      if (!meta.has(fingerprint)) {
        meta.set(fingerprint, { ruleId: v.ruleId, component: normalizeSelector(selector) });
      }
    }
    presenceByScan.push({ completedAt: s.completedAt, present });
  }

  const now = new Date();
  const dna: RegressionDNA[] = [];
  for (const [fingerprint, m] of meta) {
    const series: ScanPresencePoint[] = presenceByScan.map((p) => ({
      completedAt: p.completedAt,
      present: p.present.has(fingerprint),
    }));
    const record = buildRegressionDNA(fingerprint, m.ruleId, m.component, series, now);
    if (record) dna.push(record);
  }

  // Most volatile / chronic first for the DNA listing.
  dna.sort((a, b) => b.returns - a.returns || b.volatility - a.volatility);

  const predictions = predictRegressions(dna, { sprintDays: opts.sprintDays, limit: opts.limit });

  return { scansAnalyzed: points.length, dna: dna.slice(0, opts.limit ?? 50), predictions };
}
