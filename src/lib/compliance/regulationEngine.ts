/**
 * ---------------------------------------------------------
 * RegLayer — Regulation Engine
 * ---------------------------------------------------------
 *
 * Purpose:
 * Central registry and evaluation engine for all compliance
 * regulations supported by the platform.
 *
 * Why this exists:
 * As RegLayer supports more regulations (WCAG, EAA, ADA,
 * Section 508), we need a unified interface to evaluate
 * against any regulation set.
 *
 * Engineering Notes:
 * - Registry pattern for regulation management.
 * - Each regulation is self-contained with its rules.
 * - Evaluation is stateless and idempotent.
 * ---------------------------------------------------------
 */

import type { AccessibilityViolation, ComplianceReport, ComplianceRule } from "@/lib/types";
import { WCAG_21_RULES } from "./rules/wcagRules";
import { EU_ACCESSIBILITY_RULES } from "./rules/euAccessibilityRules";

export type RegulationId = "wcag21" | "eaa";

interface Regulation {
  id: RegulationId;
  name: string;
  version: string;
  rules: ComplianceRule[];
}

const REGULATION_REGISTRY: Record<RegulationId, Regulation> = {
  wcag21: {
    id: "wcag21",
    name: "WCAG 2.1",
    version: "2.1",
    rules: WCAG_21_RULES,
  },
  eaa: {
    id: "eaa",
    name: "European Accessibility Act",
    version: "2025",
    rules: EU_ACCESSIBILITY_RULES,
  },
};

/**
 * Get all supported regulations.
 */
export function getSupportedRegulations(): Regulation[] {
  return Object.values(REGULATION_REGISTRY);
}

/**
 * Get a specific regulation by ID.
 */
export function getRegulation(id: RegulationId): Regulation | undefined {
  return REGULATION_REGISTRY[id];
}

/**
 * Get all rules across all regulations.
 */
export function getAllRules(): ComplianceRule[] {
  return Object.values(REGULATION_REGISTRY).flatMap((reg) => reg.rules);
}
