/**
 * RegLayer — AI Root Cause Engine
 *
 * Current tools say: "Button missing label." True — but useless at scale, because
 * the SAME missing label is the same shared component repeated across hundreds of
 * pages. The real question is WHERE it comes from and HOW MUCH it touches:
 *
 *   Root cause: <IconButton>  →  fails `button-name` on 417 pages, 1,204 instances,
 *   first seen 2026-03-11  →  fix the component ONCE → all 417 pages resolved.
 *
 * That reframes remediation from "1,204 tickets" to "1 fix" — the game changer.
 *
 * DESIGN:
 *   - PURE core (`buildRootCauseClusters`) — deterministic, unit-tested, no DB.
 *   - Reuses ONE notion of component identity across the platform: the Fix Genome
 *     fingerprint (ruleId + normalized selector). Same barrier on many pages
 *     collapses to one root.
 *   - Reuses `inferRootCause` (#5) for the cause class and the pure litigation
 *     IMPACT_MULTIPLIERS for leverage weighting — no parallel constants.
 *   - Blast radius = DISTINCT pages, so leverage reflects "how much of the site
 *     one fix repairs", not raw instance noise.
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { firstSelector } from "@/lib/genome/recordOutcome";
import { computeFingerprint, normalizeSelector } from "@/lib/genome/fixGenome";
import { inferRootCause } from "@/lib/intelligence/regressionDNA";
import { IMPACT_MULTIPLIERS } from "@/lib/risk/litigationWeights";

// ── Types ───────────────────────────────────────────────────────────────────

export interface RootCauseInput {
  ruleId: string;
  impact: string;
  /** Page the violation was found on — the blast-radius unit. */
  url: string;
  selector: string | null;
  at: Date;
}

export interface RootCauseCluster {
  fingerprint: string;
  ruleId: string;
  /** Structural component signature — the shared root (e.g. "button.icon-btn"). */
  component: string;
  rootCause: string;
  /** Worst impact seen across the cluster. */
  impact: string;
  /** Total violation instances traced to this root. */
  instanceCount: number;
  /** Distinct pages affected — the "417 pages" number. */
  affectedPages: number;
  /** Distinct scans the root appeared in. */
  affectedScans: number;
  /** When the root was first observed. */
  firstSeenAt: string;
  /** affectedPages × impact weight — higher = fixing it repairs more. */
  leverageScore: number;
  /** Instances resolved by a single fix at the root. */
  fixOnceResolves: number;
  narrative: string;
}

export interface RootCauseReport {
  scansAnalyzed: number;
  totalInstances: number;
  distinctRoots: number;
  /** Roots ranked by fix leverage (biggest "fix once" wins first). */
  clusters: RootCauseCluster[];
  summary: string;
}

// ── Pure clustering ─────────────────────────────────────────────────────────

const IMPACT_RANK: Record<string, number> = { critical: 4, serious: 3, moderate: 2, minor: 1 };

function worseImpact(a: string, b: string): string {
  return (IMPACT_RANK[b?.toLowerCase()] ?? 0) > (IMPACT_RANK[a?.toLowerCase()] ?? 0) ? b : a;
}

function impactWeight(impact: string): number {
  return IMPACT_MULTIPLIERS[impact?.toLowerCase()] ?? IMPACT_MULTIPLIERS.moderate;
}

/**
 * Cluster violations by their shared component root and rank by fix leverage.
 * Pure and deterministic.
 */
export function buildRootCauseClusters(
  violations: RootCauseInput[],
  opts?: { limit?: number },
): RootCauseCluster[] {
  interface Acc {
    fingerprint: string;
    ruleId: string;
    component: string;
    impact: string;
    instanceCount: number;
    pages: Set<string>;
    scans: Set<string>;
    firstSeen: Date;
  }

  const groups = new Map<string, Acc>();

  for (const v of violations) {
    const fingerprint = computeFingerprint(v.ruleId, v.selector);
    let acc = groups.get(fingerprint);
    if (!acc) {
      acc = {
        fingerprint,
        ruleId: v.ruleId,
        component: normalizeSelector(v.selector),
        impact: v.impact,
        instanceCount: 0,
        pages: new Set(),
        scans: new Set(),
        firstSeen: v.at,
      };
      groups.set(fingerprint, acc);
    }
    acc.instanceCount += 1;
    acc.pages.add(v.url);
    // A scan is identified by url+timestamp here (pure layer has no scanId).
    acc.scans.add(`${v.url}@${v.at.getTime()}`);
    acc.impact = worseImpact(acc.impact, v.impact);
    if (v.at < acc.firstSeen) acc.firstSeen = v.at;
  }

  const clusters: RootCauseCluster[] = [...groups.values()].map((a) => {
    const affectedPages = a.pages.size;
    const leverageScore = Math.round(affectedPages * impactWeight(a.impact) * 10) / 10;
    return {
      fingerprint: a.fingerprint,
      ruleId: a.ruleId,
      component: a.component,
      rootCause: inferRootCause(a.ruleId),
      impact: a.impact,
      instanceCount: a.instanceCount,
      affectedPages,
      affectedScans: a.scans.size,
      firstSeenAt: a.firstSeen.toISOString(),
      leverageScore,
      fixOnceResolves: a.instanceCount,
      narrative: buildNarrative(a.component, a.ruleId, inferRootCause(a.ruleId), affectedPages, a.instanceCount, a.firstSeen),
    };
  });

  clusters.sort((x, y) => y.leverageScore - x.leverageScore || y.instanceCount - x.instanceCount);
  return clusters.slice(0, opts?.limit ?? 25);
}

function buildNarrative(
  component: string,
  ruleId: string,
  rootCause: string,
  affectedPages: number,
  instances: number,
  firstSeen: Date,
): string {
  const date = firstSeen.toISOString().slice(0, 10);
  const pageWord = affectedPages === 1 ? "page" : "pages";
  return (
    `Root cause: \`${component}\` — one shared implementation failing \`${ruleId}\` across ` +
    `${affectedPages} ${pageWord} (${instances} instance${instances === 1 ? "" : "s"}), first seen ${date}. ` +
    `Cause class: ${rootCause}. Fix it once at the component to resolve all ${instances}.`
  );
}

// ── DB layer ────────────────────────────────────────────────────────────────

/**
 * Trace the root causes across a workspace's recent scans: which shared
 * components drive the most violations, and how many pages one fix repairs.
 */
export async function analyzeRootCauses(
  workspaceId: string,
  opts?: { siteId?: string; url?: string; maxScans?: number; limit?: number },
): Promise<RootCauseReport> {
  const scans = await prisma.scan.findMany({
    where: {
      workspaceId,
      status: "COMPLETED",
      ...(opts?.siteId ? { siteId: opts.siteId } : {}),
      ...(opts?.url ? { url: opts.url } : {}),
    },
    orderBy: { completedAt: "desc" },
    take: opts?.maxScans ?? 300,
    select: {
      url: true,
      completedAt: true,
      createdAt: true,
      violations: { select: { ruleId: true, impact: true, affectedElements: true } },
    },
  });

  const inputs: RootCauseInput[] = [];
  for (const s of scans) {
    const at = s.completedAt ?? s.createdAt;
    for (const v of s.violations) {
      inputs.push({ ruleId: v.ruleId, impact: v.impact, url: s.url, selector: firstSelector(v.affectedElements), at });
    }
  }

  const clusters = buildRootCauseClusters(inputs, { limit: opts?.limit });
  const totalInstances = inputs.length;
  const top = clusters[0];

  const summary =
    clusters.length === 0
      ? "No violations to trace."
      : `${clusters.length} root cause${clusters.length === 1 ? "" : "s"} explain ${totalInstances} instance${totalInstances === 1 ? "" : "s"}. ` +
        `Top: \`${top.component}\` (\`${top.ruleId}\`) across ${top.affectedPages} page${top.affectedPages === 1 ? "" : "s"} — one fix resolves ${top.fixOnceResolves}.`;

  return {
    scansAnalyzed: scans.length,
    totalInstances,
    distinctRoots: clusters.length,
    clusters,
    summary,
  };
}
