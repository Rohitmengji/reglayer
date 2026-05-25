`/**
 * ---------------------------------------------------------
 * RegLayer — EU Accessibility Rules
 * ---------------------------------------------------------
 *
 * Purpose:
 * Compliance rules specific to the European Accessibility Act
 * (EAA) and EN 301 549 standard.
 *
 * Why this exists:
 * European digital regulations require specific accessibility
 * standards beyond base WCAG. This module encodes those
 * additional requirements.
 *
 * Future Extensions:
 * - Dynamic rule updates from regulation database
 * - Country-specific rule variants
 * - Temporal enforcement dates
 * ---------------------------------------------------------
 */

import type { ComplianceRule } from "@/lib/types";

export const EU_ACCESSIBILITY_RULES: ComplianceRule[] = [
  {
    id: "eaa-perceivable",
    name: "Perceivable Information",
    description:
      "Products and services shall be designed so that information is perceivable by more than one sense.",
    regulation: "European Accessibility Act",
    wcagCriteria: ["1.1.1", "1.2.1", "1.3.1", "1.4.1", "1.4.3"],
    severity: "critical",
  },
  {
    id: "eaa-operable",
    name: "Operable Interface",
    description:
      "User interface components and navigation shall be operable via multiple input methods.",
    regulation: "European Accessibility Act",
    wcagCriteria: ["2.1.1", "2.4.1", "2.4.2", "2.4.4"],
    severity: "critical",
  },
  {
    id: "eaa-understandable",
    name: "Understandable Content",
    description:
      "Information and operation of the user interface shall be understandable.",
    regulation: "European Accessibility Act",
    wcagCriteria: ["3.1.1", "3.1.2"],
    severity: "serious",
  },
  {
    id: "eaa-robust",
    name: "Robust Content",
    description:
      "Content shall be robust enough to be interpreted by assistive technologies.",
    regulation: "European Accessibility Act",
    wcagCriteria: ["4.1.1", "4.1.2"],
    severity: "serious",
  },
];
