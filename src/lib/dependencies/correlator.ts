/**
 * ---------------------------------------------------------
 * RegLayer — Dependency Regression Correlator (pure core)
 * ---------------------------------------------------------
 *
 * WHY: npm packages that render DOM elements can break accessibility when they
 *      update. By correlating version changes with score drops ACROSS TENANTS,
 *      we can warn users BEFORE they update.
 *
 * WHAT: Pure functions that analyze dependency observation data to detect
 *      statistically significant accessibility regressions per package+version.
 *      No Prisma, no Next, no "server-only" — independently testable.
 *
 * HOW: For each (package, fromVersion → toVersion) transition observed across
 *      multiple sites, compute: what fraction saw a score drop? What's the avg
 *      drop? Is it statistically significant (enough samples, high enough rate)?
 * ---------------------------------------------------------
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type AdvisoryLevel = "INFO" | "WARNING" | "CRITICAL";

export interface ObservationPair {
  siteId: string;
  package: string;
  fromVersion: string;
  toVersion: string;
  scoreBefore: number;  // Score with the old version
  scoreAfter: number;   // Score with the new version
  observedAt: Date;
}

export interface RegressionSignal {
  package: string;
  fromVersion: string;
  toVersion: string;
  level: AdvisoryLevel;
  regressionRate: number;    // 0-1 fraction of sites that regressed
  sitesAffected: number;     // Sites that saw a drop
  sitesTotal: number;        // Total sites that made this transition
  avgScoreDrop: number;      // Average score decrease (positive = drop)
  maxScoreDrop: number;      // Worst drop observed
  confidence: number;        // 0-1 statistical confidence
  affectedCriteria: string[]; // WCAG criteria (from violation diffs, if available)
}

export interface VersionTransition {
  package: string;
  fromVersion: string;
  toVersion: string;
  observations: Array<{
    siteId: string;
    scoreBefore: number;
    scoreAfter: number;
  }>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Minimum sites that must have made the transition to consider it significant. */
const MIN_SAMPLE_SIZE = 3;

/** Minimum score drop to count as a regression (not just noise). */
const MIN_SCORE_DROP = 3;

/** Regression rate thresholds for advisory levels. */
const CRITICAL_THRESHOLD = 0.25; // >25% of sites regressed
const WARNING_THRESHOLD = 0.10;  // >10% of sites regressed

// ─── Correlator ──────────────────────────────────────────────────────────────

/**
 * Analyze a set of version transitions and detect significant regressions.
 * Call this with cross-tenant data grouped by (package, fromVersion, toVersion).
 */
export function detectRegressions(transitions: VersionTransition[]): RegressionSignal[] {
  const signals: RegressionSignal[] = [];

  for (const t of transitions) {
    if (t.observations.length < MIN_SAMPLE_SIZE) continue;

    const scoreDiffs = t.observations.map((o) => o.scoreBefore - o.scoreAfter);
    const regressions = scoreDiffs.filter((d) => d >= MIN_SCORE_DROP);
    const regressionRate = regressions.length / t.observations.length;

    if (regressionRate < WARNING_THRESHOLD * 0.5) continue; // Below noise floor

    const avgDrop = regressions.length > 0
      ? regressions.reduce((a, b) => a + b, 0) / regressions.length
      : 0;
    const maxDrop = regressions.length > 0 ? Math.max(...regressions) : 0;

    // Confidence: higher sample size + consistent regression = higher confidence
    const consistency = regressions.length > 0
      ? 1 - (standardDeviation(regressions) / (avgDrop || 1))
      : 0;
    const sampleConfidence = Math.min(1, t.observations.length / 20);
    const confidence = Math.round((consistency * 0.6 + sampleConfidence * 0.4) * 100) / 100;

    const level = classifyLevel(regressionRate, avgDrop, t.observations.length);

    signals.push({
      package: t.package,
      fromVersion: t.fromVersion,
      toVersion: t.toVersion,
      level,
      regressionRate: Math.round(regressionRate * 100) / 100,
      sitesAffected: regressions.length,
      sitesTotal: t.observations.length,
      avgScoreDrop: Math.round(avgDrop * 10) / 10,
      maxScoreDrop: Math.round(maxDrop * 10) / 10,
      confidence,
      affectedCriteria: [], // Populated by the server layer from violation diffs
    });
  }

  // Sort by severity: CRITICAL first, then by regression rate
  return signals.sort((a, b) => {
    const levelOrder = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    const levelDiff = levelOrder[a.level] - levelOrder[b.level];
    if (levelDiff !== 0) return levelDiff;
    return b.regressionRate - a.regressionRate;
  });
}

/**
 * Given a site's current dependencies and known advisories, return which
 * advisories are relevant (the site uses the "from" version and hasn't
 * updated yet, OR just updated to the "to" version).
 */
export function matchAdvisories(
  siteDeps: Array<{ package: string; version: string }>,
  advisories: Array<{ package: string; fromVersion: string; toVersion: string; level: AdvisoryLevel }>
): Array<{ advisory: typeof advisories[0]; status: "at_risk" | "affected" }> {
  const matched: Array<{ advisory: typeof advisories[0]; status: "at_risk" | "affected" }> = [];

  for (const dep of siteDeps) {
    for (const adv of advisories) {
      if (dep.package !== adv.package) continue;
      if (dep.version === adv.fromVersion) {
        // Site is on the "before" version — at risk if they update
        matched.push({ advisory: adv, status: "at_risk" });
      } else if (dep.version === adv.toVersion) {
        // Site already updated — they're affected
        matched.push({ advisory: adv, status: "affected" });
      }
    }
  }

  return matched;
}

/**
 * Determine if a version string is "newer" than another (basic semver comparison).
 * Returns true if `b` is a higher version than `a`.
 */
export function isNewerVersion(a: string, b: string): boolean {
  const partsA = a.replace(/^[^0-9]*/, "").split(".").map(Number);
  const partsB = b.replace(/^[^0-9]*/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const na = partsA[i] ?? 0;
    const nb = partsB[i] ?? 0;
    if (nb > na) return true;
    if (nb < na) return false;
  }
  return false;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function classifyLevel(rate: number, avgDrop: number, sampleSize: number): AdvisoryLevel {
  // CRITICAL: high rate + significant drop + enough samples
  if (rate >= CRITICAL_THRESHOLD && avgDrop >= 5 && sampleSize >= 5) return "CRITICAL";
  // WARNING: moderate rate or moderate drop
  if (rate >= WARNING_THRESHOLD && avgDrop >= MIN_SCORE_DROP) return "WARNING";
  // INFO: any detectable signal
  return "INFO";
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}
