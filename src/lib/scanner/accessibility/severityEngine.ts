/**
 * ---------------------------------------------------------
 * RegLayer — Severity Engine
 * ---------------------------------------------------------
 *
 * Purpose:
 * Classifies and scores accessibility violations based on
 * their impact and regulatory significance.
 *
 * Why this exists:
 * Raw axe-core output treats all violations equally.
 * Enterprise compliance requires weighted severity scoring
 * that reflects actual regulatory risk.
 *
 * Engineering Notes:
 * - This module transforms raw violations into scored results.
 * - Scoring logic is independent of the scanner.
 * - Weights are configurable via constants.
 * ---------------------------------------------------------
 */

import { COMPLIANCE_THRESHOLDS } from "@/lib/constants";
import type { ScanSummary, ViolationImpact } from "@/lib/types";
import type { AxeViolation } from "./axeScanner";

/**
 * Calculate compliance score from violations.
 *
 * Scoring algorithm:
 * 1. For each violation rule, compute penalty based on severity
 *    and affected node count (with diminishing returns for nodes)
 * 2. Subtract total penalty from 100
 * 3. Clamp to 0-100
 *
 * Penalty per rule = severityBase * (1 + log2(nodeCount) / 4)
 * This ensures multiple affected nodes increase penalty
 * but don't dominate the score unfairly.
 *
 * Higher score = better compliance.
 */
export function calculateComplianceScore(violations: AxeViolation[]): number {
  if (violations.length === 0) return 100;

  const severityBase: Record<string, number> = {
    critical: 10,
    serious: 5,
    moderate: 2,
    minor: 0.5,
  };

  const totalPenalty = violations.reduce((sum, violation) => {
    const base = severityBase[violation.impact] ?? 1;
    const nodeCount = Math.max(1, violation.nodes.length);
    // Diminishing returns for multiple nodes of same rule
    const nodeMultiplier = 1 + Math.log2(nodeCount) / 4;
    return sum + base * nodeMultiplier;
  }, 0);

  const score = Math.max(0, Math.min(100, 100 - totalPenalty));
  return Math.round(score * 10) / 10;
}

/**
 * Generate a structured summary from raw violations.
 *
 * Severity buckets count violation RULES (one axe rule = one row in the Violation
 * table), not affected DOM nodes. This is deliberate: `totalViolations` is a rule
 * count, the drill-down list and chat (see violation-summary.ts) are rule counts, and
 * a Scan's stored `critical/serious/moderate/minor` are read alongside `totalViolations`
 * on the dashboard and reports. Counting nodes here made the buckets ~3.3x larger than
 * the total and unable to sum to it. Node/element counts, where needed, come from an
 * individual violation's `affectedElements`. The compliance score is unaffected — it is
 * computed separately in calculateComplianceScore, which still weighs node counts.
 */
export function generateScanSummary(violations: AxeViolation[]): ScanSummary {
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };

  for (const violation of violations) {
    const impact = violation.impact as ViolationImpact;
    if (impact in counts) {
      counts[impact] += 1;
    }
  }

  return {
    totalViolations: violations.length,
    critical: counts.critical,
    serious: counts.serious,
    moderate: counts.moderate,
    minor: counts.minor,
    score: calculateComplianceScore(violations),
  };
}

/**
 * Determine compliance status from score.
 */
export function getComplianceStatus(
  score: number
): "passing" | "warning" | "failing" {
  if (score >= COMPLIANCE_THRESHOLDS.passing) return "passing";
  if (score >= COMPLIANCE_THRESHOLDS.warning) return "warning";
  return "failing";
}
