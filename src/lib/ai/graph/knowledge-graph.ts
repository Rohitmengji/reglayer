/**
 * RegLayer — Accessibility Knowledge Graph (Phase 0: per-workspace, persistent)
 *
 * WHY THIS EXISTS:
 *   Today every scan is an island. This module connects them. It materialises a
 *   durable, aggregate graph that survives across scans and lets the AI answer
 *   questions no single scan can:
 *
 *     "Which component causes the most legal risk?"
 *     "Which WCAG rule keeps coming back after we fix it?"
 *     "Which components fail most often across the whole account?"
 *
 *   The existing `indexScan` (service.ts) writes a PER-SCAN snapshot used by RAG.
 *   This layer is deliberately AGGREGATE: nodes are STABLE identities (a component,
 *   a rule) keyed by structural fingerprint, so evidence accumulates over time.
 *
 * DESIGN NOTES:
 *   - Component identity reuses `normalizeSelector` (Fix Genome) so the SAME barrier
 *     on different pages/instances collapses to one node — no id/index noise.
 *   - Legal exposure per rule reuses the `LitigationWeight` table (weight, frequency,
 *     avgSettlement) that already powers the litigation risk engine.
 *   - Aggregate COUNTS are computed from the source tables (scans/violations) — the
 *     single source of truth — so re-ingesting a scan can never double-count.
 *   - Graph writes are idempotent upserts (unique keys), safe to replay.
 *   - Nodes are workspace-scoped now, but shaped so consenting workspaces can be
 *     pooled into a cross-tenant graph later (Phase 2) without a data migration.
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { normalizeSelector } from "@/lib/genome/fixGenome";
import { firstSelector } from "@/lib/genome/recordOutcome";
import { upsertEntity, upsertEdge } from "@/lib/ai/graph/service";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ComponentRisk {
  /** Structural component signature (stable across pages/scans). */
  signature: string;
  /** A representative concrete selector for display. */
  sampleSelector: string;
  /** Distinct accessibility rules that fail on this component. */
  ruleCount: number;
  /** Total violation instances attributed to this component. */
  violationCount: number;
  /** Impact-weighted severity (critical=10 … minor=1). */
  severityScore: number;
  /** Legal exposure in USD, summed from LitigationWeight avgSettlement × frequency. */
  legalExposureUsd: number;
  /** Composite legal-risk score (severity × legal weight). Higher = riskier. */
  riskScore: number;
  /** The rules driving this component's risk, worst first. */
  topRules: Array<{ ruleId: string; impact: string; count: number; legalWeight: number }>;
}

export interface RegressionProneRule {
  ruleId: string;
  wcagCriteria: string | null;
  /** How many fix→reappear cycles were observed. */
  regressionCount: number;
  /** Median days a fix survived before the rule reappeared. */
  medianDaysToRegress: number | null;
  /** Longest a fix survived before regressing (days). */
  maxDaysToRegress: number | null;
  /** URLs where this rule regressed. */
  affectedUrls: string[];
}

export interface ComponentViolationRank {
  signature: string;
  sampleSelector: string;
  violationCount: number;
  criticalCount: number;
}

// A minimal violation shape the pure functions operate on — decoupled from Prisma.
export interface GraphViolationInput {
  ruleId: string;
  impact: string;
  wcagCriteria: string | null;
  affectedElements: unknown;
}

// ── Pure helpers (no DB — unit tested) ──────────────────────────────────────

const IMPACT_WEIGHT: Record<string, number> = {
  critical: 10,
  serious: 6,
  moderate: 3,
  minor: 1,
};

export function impactWeight(impact: string): number {
  return IMPACT_WEIGHT[impact] ?? 1;
}

/**
 * Derive a component's stable structural signature from a violation's affected
 * elements. Falls back to `"*"` (page-level) when no selector is present.
 */
export function componentSignature(affectedElements: unknown): string {
  return normalizeSelector(firstSelector(affectedElements));
}

/** A representative concrete selector for display (first affected element). */
export function componentSample(affectedElements: unknown): string {
  return firstSelector(affectedElements) ?? "(page)";
}

/**
 * Rank components by legal risk across a set of violations.
 *
 * `legalWeights` maps ruleId → { weight, avgSettlement, frequency } from the
 * LitigationWeight table. Rules absent from the map fall back to their impact
 * weight and contribute no dollar exposure.
 */
export function rankComponentsByRisk(
  violations: GraphViolationInput[],
  legalWeights: Map<string, { weight: number; avgSettlement: number; frequency: number }>,
  limit = 20,
): ComponentRisk[] {
  interface Acc {
    signature: string;
    sampleSelector: string;
    violationCount: number;
    severityScore: number;
    legalExposureUsd: number;
    riskScore: number;
    rules: Map<string, { impact: string; count: number; legalWeight: number }>;
  }

  const byComponent = new Map<string, Acc>();

  for (const v of violations) {
    const signature = componentSignature(v.affectedElements);
    let acc = byComponent.get(signature);
    if (!acc) {
      acc = {
        signature,
        sampleSelector: componentSample(v.affectedElements),
        violationCount: 0,
        severityScore: 0,
        legalExposureUsd: 0,
        riskScore: 0,
        rules: new Map(),
      };
      byComponent.set(signature, acc);
    }

    const sev = impactWeight(v.impact);
    const lw = legalWeights.get(v.ruleId);
    const legalWeight = lw?.weight ?? 0;
    const exposure = lw ? lw.avgSettlement * lw.frequency : 0;

    acc.violationCount += 1;
    acc.severityScore += sev;
    acc.legalExposureUsd += exposure;
    // Composite: severity amplified by legal weight (1 + weight so rules with no
    // litigation data still contribute their severity).
    acc.riskScore += sev * (1 + legalWeight);

    const rule = acc.rules.get(v.ruleId);
    if (rule) rule.count += 1;
    else acc.rules.set(v.ruleId, { impact: v.impact, count: 1, legalWeight });
  }

  return [...byComponent.values()]
    .map((a) => ({
      signature: a.signature,
      sampleSelector: a.sampleSelector,
      ruleCount: a.rules.size,
      violationCount: a.violationCount,
      severityScore: Math.round(a.severityScore * 10) / 10,
      legalExposureUsd: Math.round(a.legalExposureUsd),
      riskScore: Math.round(a.riskScore * 10) / 10,
      topRules: [...a.rules.entries()]
        .map(([ruleId, r]) => ({ ruleId, impact: r.impact, count: r.count, legalWeight: r.legalWeight }))
        .sort((x, y) => y.legalWeight - x.legalWeight || y.count - x.count)
        .slice(0, 5),
    }))
    .sort((a, b) => b.riskScore - a.riskScore || b.legalExposureUsd - a.legalExposureUsd)
    .slice(0, limit);
}

/** One point in a URL's scan timeline: which rules were present, and when. */
export interface ScanPoint {
  scanId: string;
  url: string;
  completedAt: Date;
  ruleIds: Set<string>;
  wcagByRule: Map<string, string | null>;
}

interface RegressionEvent {
  ruleId: string;
  wcagCriteria: string | null;
  url: string;
  daysToRegress: number;
}

/**
 * Detect fix→reappear cycles across a URL's scan history.
 *
 * A regression is recorded when a rule is PRESENT, then ABSENT (fixed), then
 * PRESENT again. The gap between the last "present-before-fix" and the
 * "present-again" scan is the time the fix survived.
 *
 * Pure and deterministic — `timeline` must be one URL's points in chronological
 * order (oldest first).
 */
export function detectRegressionCycles(timeline: ScanPoint[]): RegressionEvent[] {
  const events: RegressionEvent[] = [];
  if (timeline.length < 3) return events;

  // Track, per rule, the timestamp it was last seen present and whether it has
  // since been fixed (absent) at least once.
  interface State { lastPresentAt: Date; wasFixed: boolean; wcag: string | null }
  const state = new Map<string, State>();

  for (const point of timeline) {
    // Rules present in this scan.
    for (const ruleId of point.ruleIds) {
      const s = state.get(ruleId);
      if (s?.wasFixed) {
        // Present again after having been fixed → regression.
        const days = (point.completedAt.getTime() - s.lastPresentAt.getTime()) / 86_400_000;
        events.push({
          ruleId,
          wcagCriteria: point.wcagByRule.get(ruleId) ?? s.wcag,
          url: point.url,
          daysToRegress: Math.max(0, Math.round(days)),
        });
      }
      state.set(ruleId, {
        lastPresentAt: point.completedAt,
        wasFixed: false,
        wcag: point.wcagByRule.get(ruleId) ?? s?.wcag ?? null,
      });
    }
    // Rules previously tracked but absent now → mark as fixed.
    for (const [ruleId, s] of state) {
      if (!point.ruleIds.has(ruleId) && !s.wasFixed) {
        s.wasFixed = true;
      }
    }
  }

  return events;
}

/** Aggregate raw regression events into per-rule stats. */
export function summarizeRegressions(events: RegressionEvent[], limit = 20): RegressionProneRule[] {
  const byRule = new Map<string, { wcag: string | null; days: number[]; urls: Set<string> }>();

  for (const e of events) {
    let r = byRule.get(e.ruleId);
    if (!r) {
      r = { wcag: e.wcagCriteria, days: [], urls: new Set() };
      byRule.set(e.ruleId, r);
    }
    r.days.push(e.daysToRegress);
    r.urls.add(e.url);
    if (!r.wcag && e.wcagCriteria) r.wcag = e.wcagCriteria;
  }

  const median = (nums: number[]): number | null => {
    if (nums.length === 0) return null;
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
  };

  return [...byRule.entries()]
    .map(([ruleId, r]) => ({
      ruleId,
      wcagCriteria: r.wcag,
      regressionCount: r.days.length,
      medianDaysToRegress: median(r.days),
      maxDaysToRegress: r.days.length ? Math.max(...r.days) : null,
      affectedUrls: [...r.urls],
    }))
    .sort((a, b) => b.regressionCount - a.regressionCount)
    .slice(0, limit);
}

// ── DB-backed insights (the killer questions) ───────────────────────────────

async function loadLegalWeights(
  ruleIds: string[],
): Promise<Map<string, { weight: number; avgSettlement: number; frequency: number }>> {
  const map = new Map<string, { weight: number; avgSettlement: number; frequency: number }>();
  if (ruleIds.length === 0) return map;
  const rows = await prisma.litigationWeight.findMany({
    where: { ruleId: { in: [...new Set(ruleIds)] } },
    select: { ruleId: true, weight: true, avgSettlement: true, frequency: true },
  });
  for (const row of rows) {
    map.set(row.ruleId, { weight: row.weight, avgSettlement: row.avgSettlement, frequency: row.frequency });
  }
  return map;
}

/** Load the most recent OPEN violations for a workspace (bounded). */
async function loadWorkspaceViolations(
  workspaceId: string,
  maxScans: number,
): Promise<GraphViolationInput[]> {
  const scans = await prisma.scan.findMany({
    where: { workspaceId, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    take: maxScans,
    select: {
      violations: {
        select: { ruleId: true, impact: true, wcagCriteria: true, affectedElements: true },
      },
    },
  });
  return scans.flatMap((s) => s.violations as GraphViolationInput[]);
}

/**
 * "Which component causes the most legal risk?" — ranked components across the
 * workspace's recent scans, weighted by severity and litigation exposure.
 */
export async function getComponentRiskRanking(
  workspaceId: string,
  opts?: { limit?: number; maxScans?: number },
): Promise<ComponentRisk[]> {
  const violations = await loadWorkspaceViolations(workspaceId, opts?.maxScans ?? 200);
  const legalWeights = await loadLegalWeights(violations.map((v) => v.ruleId));
  return rankComponentsByRisk(violations, legalWeights, opts?.limit ?? 20);
}

/** "Which components fail most often?" — ranked by raw violation volume. */
export async function getComponentViolationRanking(
  workspaceId: string,
  opts?: { limit?: number; maxScans?: number },
): Promise<ComponentViolationRank[]> {
  const violations = await loadWorkspaceViolations(workspaceId, opts?.maxScans ?? 200);

  const byComponent = new Map<string, { sample: string; count: number; critical: number }>();
  for (const v of violations) {
    const sig = componentSignature(v.affectedElements);
    let acc = byComponent.get(sig);
    if (!acc) {
      acc = { sample: componentSample(v.affectedElements), count: 0, critical: 0 };
      byComponent.set(sig, acc);
    }
    acc.count += 1;
    if (v.impact === "critical") acc.critical += 1;
  }

  return [...byComponent.entries()]
    .map(([signature, a]) => ({
      signature,
      sampleSelector: a.sample,
      violationCount: a.count,
      criticalCount: a.critical,
    }))
    .sort((a, b) => b.violationCount - a.violationCount)
    .slice(0, opts?.limit ?? 20);
}

/**
 * "Which WCAG rule regresses after we fix it?" — rules that were fixed and later
 * reappeared, with how long the fix survived.
 */
export async function getRegressionProneRules(
  workspaceId: string,
  opts?: { limit?: number; maxScansPerUrl?: number },
): Promise<RegressionProneRule[]> {
  const scans = await prisma.scan.findMany({
    where: { workspaceId, status: "COMPLETED", completedAt: { not: null } },
    orderBy: { completedAt: "asc" },
    take: 2000,
    select: {
      id: true,
      url: true,
      completedAt: true,
      violations: { select: { ruleId: true, wcagCriteria: true } },
    },
  });

  // Group scan points by URL, chronological.
  const byUrl = new Map<string, ScanPoint[]>();
  for (const s of scans) {
    if (!s.completedAt) continue;
    const ruleIds = new Set<string>();
    const wcagByRule = new Map<string, string | null>();
    for (const v of s.violations) {
      ruleIds.add(v.ruleId);
      wcagByRule.set(v.ruleId, v.wcagCriteria);
    }
    const point: ScanPoint = { scanId: s.id, url: s.url, completedAt: s.completedAt, ruleIds, wcagByRule };
    const arr = byUrl.get(s.url);
    if (arr) arr.push(point);
    else byUrl.set(s.url, [point]);
  }

  const maxPerUrl = opts?.maxScansPerUrl ?? 50;
  const events: RegressionEvent[] = [];
  for (const points of byUrl.values()) {
    events.push(...detectRegressionCycles(points.slice(-maxPerUrl)));
  }

  return summarizeRegressions(events, opts?.limit ?? 20);
}

// ── Persistent graph materialisation ────────────────────────────────────────

/**
 * Materialise a completed scan's violations into the persistent, aggregate
 * knowledge graph: stable `component` and `rule` nodes plus `exhibits` /
 * `violates` edges. Idempotent — safe to replay for the same scan.
 *
 * This is the durable structure the RAG traversal and (later) the cross-tenant
 * graph read from. Aggregate COUNTS are NOT stored on edges; they are computed
 * from the source tables by the insights functions above to avoid double-counting.
 */
export async function ingestScanIntoKnowledgeGraph(
  scanId: string,
  workspaceId: string,
): Promise<{ components: number; rules: number; edges: number }> {
  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    select: {
      completedAt: true,
      violations: {
        select: { ruleId: true, impact: true, wcagCriteria: true, affectedElements: true },
      },
    },
  });
  if (!scan) return { components: 0, rules: 0, edges: 0 };

  const seenAt = (scan.completedAt ?? new Date()).toISOString();
  const componentIds = new Map<string, string>();
  const ruleIds = new Map<string, string>();
  const wcagIds = new Map<string, string>();
  let edges = 0;

  for (const v of scan.violations) {
    const signature = componentSignature(v.affectedElements);

    // Component node (stable identity).
    let componentId = componentIds.get(signature);
    if (!componentId) {
      const node = await upsertEntity("component", signature, {
        workspaceId,
        properties: { signature, sampleSelector: componentSample(v.affectedElements) },
      });
      componentId = node.id;
      componentIds.set(signature, componentId);
    }

    // Rule node (stable identity, workspace-scoped).
    let ruleId = ruleIds.get(v.ruleId);
    if (!ruleId) {
      const node = await upsertEntity("rule", v.ruleId, {
        workspaceId,
        properties: { ruleId: v.ruleId, lastImpact: v.impact },
      });
      ruleId = node.id;
      ruleIds.set(v.ruleId, ruleId);
    }

    // component ──exhibits──→ rule
    await upsertEdge(componentId, ruleId, "exhibits", {
      weight: impactWeight(v.impact),
      properties: { lastSeenAt: seenAt, lastImpact: v.impact },
    });
    edges++;

    // rule ──violates──→ wcag (global node)
    if (v.wcagCriteria) {
      let wcagId = wcagIds.get(v.wcagCriteria);
      if (!wcagId) {
        const node = await upsertEntity("wcag", `WCAG ${v.wcagCriteria}`, {
          workspaceId: null,
          properties: { criterion: v.wcagCriteria },
        });
        wcagId = node.id;
        wcagIds.set(v.wcagCriteria, wcagId);
      }
      await upsertEdge(ruleId, wcagId, "violates");
      edges++;
    }
  }

  return { components: componentIds.size, rules: ruleIds.size, edges };
}
