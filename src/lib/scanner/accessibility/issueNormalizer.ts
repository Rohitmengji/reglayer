/**
 * ---------------------------------------------------------
 * RegLayer — Issue Normalizer
 * ---------------------------------------------------------
 *
 * Purpose:
 * Transforms raw axe-core violations into the standardized
 * RegLayer AccessibilityViolation format.
 *
 * Why this exists:
 * The internal data model must be scanner-agnostic.
 * If we switch from axe-core to another engine,
 * only this normalizer needs to change.
 *
 * Engineering Notes:
 * - Adapter pattern between scanner output and internal types.
 * - No business logic — pure transformation.
 * ---------------------------------------------------------
 */

import type { AccessibilityViolation } from "@/lib/types";
import type { AxeViolation } from "./axeScanner";

/**
 * Normalize axe-core violations to internal format.
 */
export function normalizeViolations(
  violations: AxeViolation[]
): AccessibilityViolation[] {
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    description: violation.description,
    help: violation.help,
    helpUrl: violation.helpUrl,
    wcagTags: violation.tags.filter(
      (tag) => tag.startsWith("wcag") || tag.startsWith("best-practice")
    ),
    nodes: violation.nodes.map((node) => ({
      html: node.html,
      target: node.target,
      failureSummary: node.failureSummary,
    })),
  }));
}
