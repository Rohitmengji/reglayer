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

import { SEVERITY_WEIGHTS, COMPLIANCE_THRESHOLDS } from "@/lib/constants";
import type { ScanSummary, ViolationImpact } from "@/lib/types";
import type { AxeViolation } from "./axeScanner";

/**
 * Calculate compliance score from violations.
 *
 * Scoring algorithm:
 * 1. Sum weighted violation counts
 * 2. Apply logarithmic penalty curve
 * 3. Normalize to 0-100 scale
 *
 * Higher score = better compliance.
 */
export function calculateComplianceScore(violations: AxeViolation[]): number {
  if (violations.length === 0) return 100;

  const totalPenalty = violations.reduce((sum, violation) => {
    const weight = SEVERITY_WEIGHTS[violation.impact] ?? 1;
    const nodeCount = violation.nodes.length;
    return sum + weight * nodeCount;
  }, 0);

  // Logarithmic decay prevents single violations from tanking score
  const score = Math.max(0, 100 - Math.log2(totalPenalty + 1) * 10);
  return Math.round(score * 10) / 10;
}

/**
 * Generate a structured summary from raw violations.
 */
export function generateScanSummary(violations: AxeViolation[]): ScanSummary {
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };

  for (const violation of violations) {
    const impact = violation.impact as ViolationImpact;
    if (impact in counts) {
      counts[impact] += violation.nodes.length;
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
