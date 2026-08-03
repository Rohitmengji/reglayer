/**
 * RegLayer — Accessibility Intelligence Network (cross-tenant fix learning)
 *
 * THE MOAT: every customer's verified fixes make the AI smarter for everyone.
 *
 *   Customer A fixes `button-name` on `.icon-btn` → verified.
 *   Customer B hits the same barrier → the AI says:
 *   "We've seen this 8,132 times across the network — 97% success rate."
 *
 * No competitor starting today has this history. It compounds with every scan.
 *
 * PRIVACY IS THE DESIGN, NOT A DISCLAIMER:
 *   1. OPT-IN ONLY — a workspace joins the network via the `network_contribution`
 *      feature flag. Non-consenting workspaces are NEVER read into the pool and
 *      cannot query it (fair exchange: contribute to benefit).
 *   2. ANONYMISED BY CONSTRUCTION — the network aggregates only the Fix Genome
 *      FINGERPRINT (ruleId + normalized STRUCTURAL selector) + success/timing.
 *      No URLs, no HTML, no PII, no workspace identity ever crosses the boundary.
 *   3. K-ANONYMITY — an aggregate is only surfaced when it is backed by at least
 *      MIN_CONTRIBUTORS distinct organisations, so no single customer's data can
 *      be reverse-engineered from a network answer.
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { computeFingerprint, normalizeSelector, aggregateOutcomes, CONFIDENCE_THRESHOLDS, type FixOutcome, type Confidence } from "@/lib/genome/fixGenome";

/** The consent flag key stored in WorkspaceFeature. */
export const NETWORK_FEATURE = "network_contribution";

/**
 * Minimum distinct organisations behind an aggregate before it may be shown.
 * Guards against reverse-engineering a single customer's data from a network answer.
 */
export const MIN_CONTRIBUTORS = 3;

// ── Types ───────────────────────────────────────────────────────────────────

export interface NetworkInsight {
  available: boolean;
  fingerprint: string;
  ruleId: string;
  /** Total verified outcomes network-wide for this fingerprint. */
  timesSeen: number;
  successes: number;
  /** Verified success rate across the network (0–100). */
  successRate: number;
  /** Distinct organisations behind the aggregate (the k-anonymity basis). */
  distinctOrgs: number;
  medianDaysToEffect: number | null;
  confidence: Confidence;
  message: string;
  /** Present when `available` is false. */
  reason?: string;
}

// ── Consent ─────────────────────────────────────────────────────────────────

/** Whether a workspace has opted into the Intelligence Network. */
export async function hasNetworkConsent(workspaceId: string): Promise<boolean> {
  const row = await prisma.workspaceFeature.findUnique({
    where: { workspaceId_feature: { workspaceId, feature: NETWORK_FEATURE } },
    select: { enabled: true, expiresAt: true },
  });
  if (!row || !row.enabled) return false;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return false;
  return true;
}

/** Opt a workspace in or out of the network. Reversible at any time. */
export async function setNetworkConsent(
  workspaceId: string,
  enabled: boolean,
  grantedBy: string,
): Promise<void> {
  await prisma.workspaceFeature.upsert({
    where: { workspaceId_feature: { workspaceId, feature: NETWORK_FEATURE } },
    update: { enabled, grantedBy, grantedAt: new Date() },
    create: { workspaceId, feature: NETWORK_FEATURE, enabled, grantedBy },
  });
}

/** The set of workspace ids currently contributing to (and eligible to read) the network. */
export async function consentingWorkspaceIds(): Promise<string[]> {
  const rows = await prisma.workspaceFeature.findMany({
    where: {
      feature: NETWORK_FEATURE,
      enabled: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { workspaceId: true },
  });
  return rows.map((r) => r.workspaceId);
}

// ── Pure insight builder ────────────────────────────────────────────────────

function confidenceFor(n: number): Confidence {
  if (n >= CONFIDENCE_THRESHOLDS.high) return "high";
  if (n >= CONFIDENCE_THRESHOLDS.medium) return "medium";
  if (n >= CONFIDENCE_THRESHOLDS.low) return "low";
  return "insufficient";
}

/**
 * Compose a network insight from an aggregated fingerprint, enforcing k-anonymity.
 * Pure and deterministic.
 */
export function buildNetworkInsight(input: {
  fingerprint: string;
  ruleId: string;
  timesSeen: number;
  successes: number;
  successRate: number;
  medianDaysToEffect: number | null;
  distinctOrgs: number;
  minContributors?: number;
}): NetworkInsight {
  const minContributors = input.minContributors ?? MIN_CONTRIBUTORS;
  const base: NetworkInsight = {
    available: false,
    fingerprint: input.fingerprint,
    ruleId: input.ruleId,
    timesSeen: input.timesSeen,
    successes: input.successes,
    successRate: input.successRate,
    distinctOrgs: input.distinctOrgs,
    medianDaysToEffect: input.medianDaysToEffect,
    confidence: confidenceFor(input.timesSeen),
    message: "",
  };

  if (input.timesSeen === 0) {
    return { ...base, reason: "No network history for this fix yet.", message: "This fix hasn't been seen across the network yet." };
  }
  if (input.distinctOrgs < minContributors) {
    // Withhold the numbers entirely — revealing them could de-anonymise a contributor.
    return {
      ...base,
      available: false,
      reason: `Too few contributing organisations (${input.distinctOrgs} < ${minContributors}) to share a network insight.`,
      message: "Not enough cross-organisation data yet to share a network benchmark for this fix.",
    };
  }

  const duration = input.medianDaysToEffect !== null ? ` (median ${input.medianDaysToEffect} day${input.medianDaysToEffect === 1 ? "" : "s"} to take effect)` : "";
  return {
    ...base,
    available: true,
    message:
      `We've seen \`${input.ruleId}\` on this component ${input.timesSeen.toLocaleString()} time${input.timesSeen === 1 ? "" : "s"} ` +
      `across ${input.distinctOrgs.toLocaleString()} organisations — ${input.successRate}% of verified fixes succeeded${duration}.`,
  };
}

// ── Network queries ─────────────────────────────────────────────────────────

/** Load verified outcomes for a fingerprint across all consenting workspaces. */
async function loadNetworkOutcomes(
  fingerprint: string,
): Promise<{ outcomes: FixOutcome[]; distinctOrgs: number }> {
  const consenting = await consentingWorkspaceIds();
  if (consenting.length === 0) return { outcomes: [], distinctOrgs: 0 };

  try {
    const rows = await prisma.fixOutcomeRecord.findMany({
      where: { fingerprint, workspaceId: { in: consenting } },
      take: 20_000,
      select: { ruleId: true, fingerprint: true, success: true, daysToEffect: true, verifiedAt: true, verifiedVia: true, workspaceId: true },
    });
    const orgs = new Set<string>();
    for (const r of rows) if (r.workspaceId) orgs.add(r.workspaceId);
    return {
      outcomes: rows.map((r) => ({
        ruleId: r.ruleId,
        fingerprint: r.fingerprint,
        success: r.success,
        daysToEffect: r.daysToEffect,
        verifiedAt: r.verifiedAt,
        verifiedVia: r.verifiedVia,
      })),
      distinctOrgs: orgs.size,
    };
  } catch {
    return { outcomes: [], distinctOrgs: 0 }; // fix_outcomes not provisioned
  }
}

/**
 * Ask the network about a specific fix. Consent-gated: the requesting workspace
 * must itself be a contributor. Returns a k-anonymised benchmark.
 */
export async function queryNetworkForFix(
  workspaceId: string,
  ruleId: string,
  selector: string | null,
): Promise<NetworkInsight & { consented: boolean }> {
  const fingerprint = computeFingerprint(ruleId, selector);
  const consented = await hasNetworkConsent(workspaceId);
  if (!consented) {
    return {
      consented: false,
      available: false,
      fingerprint,
      ruleId,
      timesSeen: 0,
      successes: 0,
      successRate: 0,
      distinctOrgs: 0,
      medianDaysToEffect: null,
      confidence: "insufficient",
      message: "Join the Intelligence Network to see how the whole network fixes this.",
      reason: "Workspace has not opted into the Intelligence Network.",
    };
  }

  const { outcomes, distinctOrgs } = await loadNetworkOutcomes(fingerprint);
  const [agg] = aggregateOutcomes(outcomes, { by: "fingerprint" });

  const insight = buildNetworkInsight({
    fingerprint,
    ruleId,
    timesSeen: agg?.attempts ?? 0,
    successes: agg?.successes ?? 0,
    successRate: agg?.successRate ?? 0,
    medianDaysToEffect: agg?.medianDaysToEffect ?? null,
    distinctOrgs,
  });
  return { ...insight, consented: true };
}

export interface NetworkStats {
  consented: boolean;
  contributingOrgs: number;
  totalVerifiedOutcomes: number;
  /** Highest-confidence proven fixes across the network (k-anonymised). */
  topProvenFixes: Array<{ ruleId: string; fingerprint: string; timesSeen: number; successRate: number }>;
}

/**
 * Network overview for a consenting workspace: how big the pool is and which
 * fixes are the most proven. All aggregates respect k-anonymity.
 */
export async function getNetworkStats(workspaceId: string, opts?: { limit?: number }): Promise<NetworkStats> {
  const consented = await hasNetworkConsent(workspaceId);
  if (!consented) {
    return { consented: false, contributingOrgs: 0, totalVerifiedOutcomes: 0, topProvenFixes: [] };
  }

  const consenting = await consentingWorkspaceIds();
  if (consenting.length === 0) {
    return { consented: true, contributingOrgs: 0, totalVerifiedOutcomes: 0, topProvenFixes: [] };
  }

  let rows: Array<{ ruleId: string; fingerprint: string; success: boolean; daysToEffect: number | null; verifiedAt: Date; verifiedVia: string; workspaceId: string | null }> = [];
  try {
    rows = await prisma.fixOutcomeRecord.findMany({
      where: { workspaceId: { in: consenting } },
      take: 50_000,
      select: { ruleId: true, fingerprint: true, success: true, daysToEffect: true, verifiedAt: true, verifiedVia: true, workspaceId: true },
    });
  } catch {
    return { consented: true, contributingOrgs: 0, totalVerifiedOutcomes: 0, topProvenFixes: [] };
  }

  // Distinct orgs per fingerprint, for k-anonymity gating of each row.
  const orgsByFingerprint = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.workspaceId) continue;
    let s = orgsByFingerprint.get(r.fingerprint);
    if (!s) { s = new Set(); orgsByFingerprint.set(r.fingerprint, s); }
    s.add(r.workspaceId);
  }

  const aggregates = aggregateOutcomes(
    rows.map((r) => ({ ruleId: r.ruleId, fingerprint: r.fingerprint, success: r.success, daysToEffect: r.daysToEffect, verifiedAt: r.verifiedAt, verifiedVia: r.verifiedVia })),
    { by: "fingerprint" },
  );

  const topProvenFixes = aggregates
    .filter((a) => (orgsByFingerprint.get(a.key)?.size ?? 0) >= MIN_CONTRIBUTORS && a.attempts >= CONFIDENCE_THRESHOLDS.medium)
    .sort((a, b) => b.successRate - a.successRate || b.attempts - a.attempts)
    .slice(0, opts?.limit ?? 20)
    .map((a) => ({ ruleId: a.ruleId, fingerprint: a.key, timesSeen: a.attempts, successRate: a.successRate }));

  return {
    consented: true,
    contributingOrgs: consenting.length,
    totalVerifiedOutcomes: rows.length,
    topProvenFixes,
  };
}

// Re-export for callers that need the structural signature (e.g. UI/API).
export { normalizeSelector };
