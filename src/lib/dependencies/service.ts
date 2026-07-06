/**
 * ---------------------------------------------------------
 * RegLayer — Dependency Advisory Service (server-only)
 * ---------------------------------------------------------
 *
 * WHY: Cross-tenant dependency observations need to be periodically analyzed
 *      to generate advisories warning affected users.
 *
 * WHAT:
 *  - `recordObservations`: Best-effort recorder called after each scan
 *  - `generateAdvisories`: Periodic analysis (cron) that correlates observations
 *  - `getAdvisoriesForSite`: Returns relevant advisories for a site's deps
 *
 * HOW: Uses the pure correlator for analysis, Prisma for persistence.
 * ---------------------------------------------------------
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { detectRegressions, matchAdvisories, isNewerVersion, type VersionTransition } from "./correlator";
import { logger } from "@/lib/telemetry/logger";
import type { DetectedDependency } from "./detector";

const log = logger.withContext({ module: "dep-advisory" });

// ─── Record Observations (best-effort, post-scan) ────────────────────────────

/**
 * Record detected dependencies for a scan. Best-effort — never throws.
 * Called from the scan pipeline after library detection.
 */
export async function recordDependencyObservations(params: {
  workspaceId: string;
  siteId: string;
  scanId: string;
  score: number;
  dependencies: DetectedDependency[];
}): Promise<void> {
  if (params.dependencies.length === 0) return;

  try {
    await prisma.dependencyObservation.createMany({
      data: params.dependencies.map((dep) => ({
        workspaceId: params.workspaceId,
        siteId: params.siteId,
        scanId: params.scanId,
        package: dep.package,
        version: dep.version,
        source: dep.source,
        score: params.score,
      })),
      skipDuplicates: true,
    });
  } catch (err) {
    log.warn("Failed to record dependency observations", {
      error: err instanceof Error ? err.message : "Unknown",
    });
  }
}

// ─── Generate Advisories (periodic analysis) ─────────────────────────────────

/**
 * Analyze dependency observations across all tenants and generate advisories.
 * Run periodically (daily) from the cron. Idempotent — skips already-published
 * (package, fromVersion, toVersion) tuples.
 */
export async function generateAdvisories(): Promise<{ generated: number; skipped: number }> {
  let generated = 0;
  let skipped = 0;

  // Get all packages with multiple observed versions in the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const packages = await prisma.dependencyObservation.groupBy({
    by: ["package"],
    where: { observedAt: { gte: thirtyDaysAgo }, score: { not: null } },
    _count: { package: true },
    having: { package: { _count: { gte: 3 } } },
    orderBy: { _count: { package: "desc" } },
    take: 50, // Process top 50 packages
  });

  for (const pkg of packages) {
    // Get version transitions for this package
    const transitions = await buildTransitions(pkg.package, thirtyDaysAgo);
    if (transitions.length === 0) continue;

    // Run the pure correlator
    const signals = detectRegressions(transitions);

    for (const signal of signals) {
      if (signal.level === "INFO" && signal.confidence < 0.3) continue; // Skip noise

      // Check if already published
      const existing = await prisma.dependencyAdvisory.findUnique({
        where: {
          package_fromVersion_toVersion: {
            package: signal.package,
            fromVersion: signal.fromVersion,
            toVersion: signal.toVersion,
          },
        },
      });
      if (existing) {
        skipped++;
        continue;
      }

      // Generate the advisory
      await prisma.dependencyAdvisory.create({
        data: {
          package: signal.package,
          fromVersion: signal.fromVersion,
          toVersion: signal.toVersion,
          level: signal.level,
          title: generateTitle(signal),
          description: generateDescription(signal),
          affectedCriteria: signal.affectedCriteria,
          regressionRate: signal.regressionRate,
          sitesAffected: signal.sitesAffected,
          sitesTotal: signal.sitesTotal,
          avgScoreDrop: signal.avgScoreDrop,
        },
      });
      generated++;
    }
  }

  log.info("Advisory generation complete", { generated, skipped });
  return { generated, skipped };
}

// ─── Query Advisories for a Site ─────────────────────────────────────────────

/**
 * Get relevant advisories for a site based on its detected dependencies.
 */
export async function getAdvisoriesForSite(siteId: string): Promise<{
  advisories: Array<{
    id: string;
    package: string;
    fromVersion: string;
    toVersion: string;
    level: string;
    title: string;
    description: string;
    regressionRate: number;
    sitesAffected: number;
    avgScoreDrop: number;
    fixSuggestion: string | null;
    fixSuccessRate: number | null;
    status: "at_risk" | "affected";
  }>;
}> {
  // Get the site's latest dependency observations
  const latestObs = await prisma.dependencyObservation.findMany({
    where: { siteId },
    orderBy: { observedAt: "desc" },
    take: 100,
    distinct: ["package"],
  });

  if (latestObs.length === 0) return { advisories: [] };

  const siteDeps = latestObs.map((o) => ({ package: o.package, version: o.version }));

  // Get all active advisories
  const allAdvisories = await prisma.dependencyAdvisory.findMany({
    where: {
      resolvedAt: null, // Only unresolved
      package: { in: siteDeps.map((d) => d.package) },
    },
    orderBy: { publishedAt: "desc" },
  });

  // Match against site's deps
  const matched = matchAdvisories(siteDeps, allAdvisories);

  return {
    advisories: matched.map((m) => {
      const adv = allAdvisories.find(
        (a) => a.package === m.advisory.package && a.toVersion === m.advisory.toVersion
      )!;
      return {
        id: adv.id,
        package: adv.package,
        fromVersion: adv.fromVersion,
        toVersion: adv.toVersion,
        level: adv.level,
        title: adv.title,
        description: adv.description,
        regressionRate: adv.regressionRate,
        sitesAffected: adv.sitesAffected,
        avgScoreDrop: adv.avgScoreDrop,
        fixSuggestion: adv.fixSuggestion,
        fixSuccessRate: adv.fixSuccessRate,
        status: m.status,
      };
    }),
  };
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Build version transitions for a package: find sites that went from version A → B
 * and pair their before/after scores.
 */
async function buildTransitions(packageName: string, since: Date): Promise<VersionTransition[]> {
  // Get all observations for this package with scores, grouped by site
  const observations = await prisma.dependencyObservation.findMany({
    where: { package: packageName, observedAt: { gte: since }, score: { not: null } },
    orderBy: { observedAt: "asc" },
    select: { siteId: true, version: true, score: true, observedAt: true },
  });

  // Group by site
  const bySite = new Map<string, typeof observations>();
  for (const obs of observations) {
    if (!obs.siteId) continue;
    const list = bySite.get(obs.siteId) || [];
    list.push(obs);
    bySite.set(obs.siteId, list);
  }

  // Find version transitions per site
  const transitionMap = new Map<string, VersionTransition>();

  for (const [siteId, siteObs] of bySite) {
    // Find where version changed
    for (let i = 1; i < siteObs.length; i++) {
      const prev = siteObs[i - 1];
      const curr = siteObs[i];
      if (prev.version === curr.version) continue;
      if (!isNewerVersion(prev.version, curr.version)) continue;

      const key = `${prev.version}→${curr.version}`;
      const existing = transitionMap.get(key) || {
        package: packageName,
        fromVersion: prev.version,
        toVersion: curr.version,
        observations: [],
      };
      existing.observations.push({
        siteId,
        scoreBefore: prev.score!,
        scoreAfter: curr.score!,
      });
      transitionMap.set(key, existing);
    }
  }

  return Array.from(transitionMap.values());
}

function generateTitle(signal: ReturnType<typeof detectRegressions>[0]): string {
  const dropText = signal.avgScoreDrop >= 10 ? "significant" : "moderate";
  return `${signal.package} ${signal.toVersion}: ${dropText} accessibility regression detected (${Math.round(signal.regressionRate * 100)}% of sites affected)`;
}

function generateDescription(signal: ReturnType<typeof detectRegressions>[0]): string {
  return [
    `Updating ${signal.package} from ${signal.fromVersion} to ${signal.toVersion} caused accessibility regressions on ${signal.sitesAffected} of ${signal.sitesTotal} monitored sites (${Math.round(signal.regressionRate * 100)}%).`,
    `Average score drop: ${signal.avgScoreDrop} points. Maximum observed drop: ${signal.maxScoreDrop} points.`,
    signal.affectedCriteria.length > 0
      ? `Affected WCAG criteria: ${signal.affectedCriteria.join(", ")}.`
      : "",
    `Confidence: ${Math.round(signal.confidence * 100)}% (based on ${signal.sitesTotal} observations).`,
  ].filter(Boolean).join("\n\n");
}
