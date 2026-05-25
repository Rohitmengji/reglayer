/**
 * ---------------------------------------------------------
 * RegLayer — WCAG Compliance Rules
 * ---------------------------------------------------------
 *
 * Purpose:
 * Machine-readable WCAG 2.1 compliance rules that can be
 * evaluated against scan results.
 *
 * Why this exists:
 * Compliance is not a scan result — it's a judgment.
 * Rules define what "compliant" means for each criterion.
 * The rule engine evaluates scan results against these rules.
 *
 * Future Extensions:
 * - Dynamic rule loading from database
 * - Customer-specific rule overrides
 * - Regulation versioning
 * ---------------------------------------------------------
 */

import type { ComplianceRule } from "@/lib/types";

export const WCAG_21_RULES: ComplianceRule[] = [
  {
    id: "wcag-1.1.1",
    name: "Non-text Content",
    description:
      "All non-text content has a text alternative that serves the equivalent purpose.",
    regulation: "WCAG 2.1",
    wcagCriteria: ["1.1.1"],
    severity: "serious",
  },
  {
    id: "wcag-1.3.1",
    name: "Info and Relationships",
    description:
      "Information, structure, and relationships conveyed through presentation can be programmatically determined.",
    regulation: "WCAG 2.1",
    wcagCriteria: ["1.3.1"],
    severity: "serious",
  },
  {
    id: "wcag-1.4.3",
    name: "Contrast (Minimum)",
    description:
      "Text and images of text have a contrast ratio of at least 4.5:1.",
    regulation: "WCAG 2.1",
    wcagCriteria: ["1.4.3"],
    severity: "moderate",
  },
  {
    id: "wcag-2.1.1",
    name: "Keyboard",
    description:
      "All functionality is operable through a keyboard interface.",
    regulation: "WCAG 2.1",
    wcagCriteria: ["2.1.1"],
    severity: "critical",
  },
  {
    id: "wcag-2.4.2",
    name: "Page Titled",
    description: "Web pages have titles that describe topic or purpose.",
    regulation: "WCAG 2.1",
    wcagCriteria: ["2.4.2"],
    severity: "minor",
  },
  {
    id: "wcag-2.4.4",
    name: "Link Purpose (In Context)",
    description:
      "The purpose of each link can be determined from the link text alone.",
    regulation: "WCAG 2.1",
    wcagCriteria: ["2.4.4"],
    severity: "moderate",
  },
  {
    id: "wcag-3.1.1",
    name: "Language of Page",
    description:
      "The default human language of each Web page can be programmatically determined.",
    regulation: "WCAG 2.1",
    wcagCriteria: ["3.1.1"],
    severity: "serious",
  },
  {
    id: "wcag-4.1.2",
    name: "Name, Role, Value",
    description:
      "For all UI components, the name and role can be programmatically determined.",
    regulation: "WCAG 2.1",
    wcagCriteria: ["4.1.2"],
    severity: "critical",
  },
];
