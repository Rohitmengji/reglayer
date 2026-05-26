/**
 * ---------------------------------------------------------
 * RegLayer — Regression Detector
 * ---------------------------------------------------------
 *
 * Compares a new scan against the previous scan of the same URL
 * to identify regressions (new violations) and improvements
 * (fixed violations).
 *
 * This is the intelligence layer that transforms raw scan data
 * into actionable change detection:
 * - NEW violations = regressions (something broke)
 * - FIXED violations = improvements (something was fixed)
 * - SCORE DELTA = quick health indicator
 *
 * Used by:
 * - Cron runner (after each scheduled scan)
 * - Alert engine (regression-based triggers)
 * - Notification dispatcher (context-rich alerts)
 * ---------------------------------------------------------
 */

import { prisma } from "@/lib/database/prisma";
import { logger } from "@/lib/telemetry/logger";

const log = logger.withContext({ module: "regressionDetector" });

export interface RegressionReport {
  /** Current scan ID */
  currentScanId: string;
  /** Previous scan ID (null if first scan) */
  previousScanId: string | null;
  /** URL that was scanned */
  url: string;
  /** Score change (positive = improvement, negative = regression) */
  scoreDelta: number;
  /** Current score */
  currentScore: number;
  /** Previous score (null if first scan) */
  previousScore: number | null;
  /** Violations that are NEW (didn't exist in previous scan) */
  newViolations: RegressionViolation[];
  /** Violations that were FIXED (existed in previous, gone now) */
  fixedViolations: RegressionViolation[];
  /** Violations that PERSIST (exist in both scans) */
  persistingViolations: number;
  /** Whether this represents a regression */
  isRegression: boolean;
  /** Whether this represents an improvement */
  isImprovement: boolean;
  /** Whether this is the first scan (no comparison possible) */
  isFirstScan: boolean;
  /** Summary message for notifications */
  summary: string;
}

export interface RegressionViolation {
  ruleId: string;
  impact: string;
  description: string;
  help: string;
  wcagCriteria: string | null;
  affectedCount: number;
}

/**
 * Detect regressions by comparing a completed scan with the
 * most recent previous scan of the same URL in the same workspace.
 */
export async function detectRegressions(
  scanId: string,
  url: string,
  workspaceId: string | null
): Promise<RegressionReport> {
  // Get the current scan with violations
  const currentScan = await prisma.scan.findUnique({
    where: { id: scanId },
    include: {
      violations: {
        select: { ruleId: true, impact: true, description: true, help: true, wcagCriteria: true, affectedElements: true },
      },
    },
  });

  if (!currentScan) {
    throw new Error(`Scan ${scanId} not found`);
  }

  // Find the most recent COMPLETED scan of the same URL (excluding current)
  const previousScan = await prisma.scan.findFirst({
    where: {
      url,
      status: "COMPLETED",
      id: { not: scanId },
      ...(workspaceId ? { workspaceId } : {}),
    },
    orderBy: { completedAt: "desc" },
    include: {
      violations: {
        select: { ruleId: true, impact: true, description: true, help: true, wcagCriteria: true, affectedElements: true },
      },
    },
  });

  // First scan — no comparison possible
  if (!previousScan) {
    return {
      currentScanId: scanId,
      previousScanId: null,
      url,
      scoreDelta: 0,
      currentScore: currentScan.score ?? 0,
      previousScore: null,
      newViolations: [],
      fixedViolations: [],
      persistingViolations: currentScan.violations.length,
      isRegression: false,
      isImprovement: false,
      isFirstScan: true,
      summary: `First scan of ${new URL(url).hostname}: score ${currentScan.score ?? 0}/100 with ${currentScan.totalViolations} violations`,
    };
  }

  // Build rule sets for comparison
  const currentRules = new Set(currentScan.violations.map((v) => v.ruleId));
  const previousRules = new Set(previousScan.violations.map((v) => v.ruleId));

  // NEW = in current but NOT in previous
  const newRuleIds = [...currentRules].filter((id) => !previousRules.has(id));
  const newViolations: RegressionViolation[] = currentScan.violations
    .filter((v) => newRuleIds.includes(v.ruleId))
    .map((v) => ({
      ruleId: v.ruleId,
      impact: v.impact,
      description: v.description,
      help: v.help,
      wcagCriteria: v.wcagCriteria,
      affectedCount: Array.isArray(v.affectedElements) ? (v.affectedElements as unknown[]).length : 1,
    }));

  // FIXED = in previous but NOT in current
  const fixedRuleIds = [...previousRules].filter((id) => !currentRules.has(id));
  const fixedViolations: RegressionViolation[] = previousScan.violations
    .filter((v) => fixedRuleIds.includes(v.ruleId))
    .map((v) => ({
      ruleId: v.ruleId,
      impact: v.impact,
      description: v.description,
      help: v.help,
      wcagCriteria: v.wcagCriteria,
      affectedCount: Array.isArray(v.affectedElements) ? (v.affectedElements as unknown[]).length : 1,
    }));

  // PERSISTING = in both
  const persistingViolations = [...currentRules].filter((id) => previousRules.has(id)).length;

  const currentScore = currentScan.score ?? 0;
  const previousScore = previousScan.score ?? 0;
  const scoreDelta = currentScore - previousScore;

  // Determine regression/improvement status
  const hasCriticalNew = newViolations.some((v) => v.impact === "critical");
  const isRegression = scoreDelta < -5 || hasCriticalNew || newViolations.length >= 3;
  const isImprovement = scoreDelta > 5 || fixedViolations.length >= 3;

  // Build human-readable summary
  const summary = buildSummary({
    url,
    currentScore,
    previousScore,
    scoreDelta,
    newViolations,
    fixedViolations,
    isRegression,
    isImprovement,
  });

  log.info("Regression analysis complete", {
    scanId,
    url,
    scoreDelta,
    newViolations: newViolations.length,
    fixedViolations: fixedViolations.length,
    isRegression,
    isImprovement,
  });

  return {
    currentScanId: scanId,
    previousScanId: previousScan.id,
    url,
    scoreDelta,
    currentScore,
    previousScore,
    newViolations,
    fixedViolations,
    persistingViolations,
    isRegression,
    isImprovement,
    isFirstScan: false,
    summary,
  };
}

/**
 * Build a human-readable summary for notifications.
 */
function buildSummary(params: {
  url: string;
  currentScore: number;
  previousScore: number;
  scoreDelta: number;
  newViolations: RegressionViolation[];
  fixedViolations: RegressionViolation[];
  isRegression: boolean;
  isImprovement: boolean;
}): string {
  const hostname = new URL(params.url).hostname;
  const direction = params.scoreDelta > 0 ? "↑" : params.scoreDelta < 0 ? "↓" : "→";
  const parts: string[] = [];

  parts.push(`${hostname}: ${params.previousScore} ${direction} ${params.currentScore}/100`);

  if (params.isRegression) {
    const criticalNew = params.newViolations.filter((v) => v.impact === "critical");
    if (criticalNew.length > 0) {
      parts.push(`⚠️ ${criticalNew.length} new critical violation${criticalNew.length > 1 ? "s" : ""}`);
    }
    if (params.newViolations.length > 0) {
      parts.push(`${params.newViolations.length} new issue${params.newViolations.length > 1 ? "s" : ""} detected`);
    }
  }

  if (params.isImprovement && params.fixedViolations.length > 0) {
    parts.push(`✅ ${params.fixedViolations.length} issue${params.fixedViolations.length > 1 ? "s" : ""} fixed`);
  }

  return parts.join(" · ");
}
