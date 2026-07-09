/**
 * RegLayer — Regulatory Radar Service
 *
 * WHY: Organizations know deadlines exist, but don't know which of THEIR current
 *      violations will put them out of compliance when enforcement begins.
 * WHAT: Cross-references a workspace's actual violations against the WCAG criteria
 *       required by each upcoming regulation, producing a per-regulation readiness
 *       score and specific "fix before deadline" action items.
 * HOW: Fetches recent violations → maps them to WCAG criteria → compares against
 *      each regulation's required criteria → computes readiness % and gap list.
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import {
  REGULATIONS,
  getApplicableDeadlines,
  type Regulation,
  type DeadlineAlert,
} from "@/lib/regulations/deadlineEngine";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RadarRegulation {
  id: string;
  name: string;
  shortName: string;
  jurisdiction: string;
  region: string;
  readiness: number; // 0-100 percentage
  status: "compliant" | "at-risk" | "non-compliant";
  daysUntilEnforcement: number | null; // nearest upcoming deadline
  enforcementDate: string | null;
  failingCriteria: FailingCriterion[];
  estimatedEffort: EffortEstimate;
  penalties: {
    maxFine: string;
    privateRightOfAction: boolean;
  };
}

export interface FailingCriterion {
  criterion: string; // e.g. "1.4.3"
  title: string;
  violationCount: number;
  impact: "critical" | "serious" | "moderate" | "minor";
  sampleRuleIds: string[]; // axe rule IDs that caused the failure
}

export interface EffortEstimate {
  totalViolations: number;
  criticalCount: number;
  estimatedHours: number;
  complexity: "low" | "medium" | "high";
}

export interface RadarSummary {
  overallReadiness: number;
  regulationsAtRisk: number;
  regulationsCompliant: number;
  criticalDeadlines: number; // deadlines within 90 days where you're non-compliant
  topPriority: string | null; // regulation ID that needs most urgent attention
}

export interface RadarResult {
  summary: RadarSummary;
  regulations: RadarRegulation[];
  alerts: DeadlineAlert[];
}

// ─── WCAG Criteria Sets ─────────────────────────────────────────────────────

const WCAG_20_AA_CRITERIA = [
  "1.1.1", "1.2.1", "1.2.2", "1.2.3", "1.2.5",
  "1.3.1", "1.3.2", "1.3.3",
  "1.4.1", "1.4.2", "1.4.3", "1.4.4", "1.4.5",
  "2.1.1", "2.1.2",
  "2.2.1", "2.2.2",
  "2.3.1",
  "2.4.1", "2.4.2", "2.4.3", "2.4.4", "2.4.5", "2.4.6", "2.4.7",
  "3.1.1", "3.1.2",
  "3.2.1", "3.2.2", "3.2.3", "3.2.4",
  "3.3.1", "3.3.2", "3.3.3", "3.3.4",
  "4.1.1", "4.1.2",
];

const WCAG_21_AA_CRITERIA = [
  ...WCAG_20_AA_CRITERIA,
  // New in WCAG 2.1
  "1.3.4", "1.3.5",
  "1.4.10", "1.4.11", "1.4.12", "1.4.13",
  "2.1.4",
  "2.5.1", "2.5.2", "2.5.3", "2.5.4",
  "4.1.3",
];

// ─── WCAG Criteria required by each regulation ───────────────────────────────

/**
 * Maps regulation ID → set of WCAG criteria that the regulation requires.
 * WCAG 2.1 AA has 50 success criteria; WCAG 2.2 AA adds 9 more.
 */
const REGULATION_WCAG_REQUIREMENTS: Record<string, string[]> = {
  // EAA requires EN 301 549 which maps to WCAG 2.1 AA (all 50 criteria)
  "eaa": WCAG_21_AA_CRITERIA,
  // ADA Title III — DOJ rule references WCAG 2.1 AA
  "ada-title-iii": WCAG_21_AA_CRITERIA,
  // AODA — WCAG 2.0 AA
  "aoda": WCAG_20_AA_CRITERIA,
  // EN 301 549 — WCAG 2.1 AA + additional ICT requirements
  "en-301-549": WCAG_21_AA_CRITERIA,
  // Section 508 — currently WCAG 2.0 AA, refresh will align to 2.2
  "section-508": WCAG_20_AA_CRITERIA,
  // UK PSBAR — WCAG 2.1 AA
  "uk-equality-act": WCAG_21_AA_CRITERIA,
  // Australia DDA — WCAG 2.1 AA (advisory)
  "dda-australia": WCAG_21_AA_CRITERIA,
};

// Friendly names for WCAG criteria
const WCAG_CRITERION_NAMES: Record<string, string> = {
  "1.1.1": "Non-text Content",
  "1.2.1": "Audio-only and Video-only",
  "1.2.2": "Captions (Prerecorded)",
  "1.2.3": "Audio Description or Media Alternative",
  "1.2.5": "Audio Description (Prerecorded)",
  "1.3.1": "Info and Relationships",
  "1.3.2": "Meaningful Sequence",
  "1.3.3": "Sensory Characteristics",
  "1.3.4": "Orientation",
  "1.3.5": "Identify Input Purpose",
  "1.4.1": "Use of Color",
  "1.4.2": "Audio Control",
  "1.4.3": "Contrast (Minimum)",
  "1.4.4": "Resize Text",
  "1.4.5": "Images of Text",
  "1.4.10": "Reflow",
  "1.4.11": "Non-text Contrast",
  "1.4.12": "Text Spacing",
  "1.4.13": "Content on Hover or Focus",
  "2.1.1": "Keyboard",
  "2.1.2": "No Keyboard Trap",
  "2.1.4": "Character Key Shortcuts",
  "2.2.1": "Timing Adjustable",
  "2.2.2": "Pause, Stop, Hide",
  "2.3.1": "Three Flashes or Below Threshold",
  "2.4.1": "Bypass Blocks",
  "2.4.2": "Page Titled",
  "2.4.3": "Focus Order",
  "2.4.4": "Link Purpose (In Context)",
  "2.4.5": "Multiple Ways",
  "2.4.6": "Headings and Labels",
  "2.4.7": "Focus Visible",
  "2.5.1": "Pointer Gestures",
  "2.5.2": "Pointer Cancellation",
  "2.5.3": "Label in Name",
  "2.5.4": "Motion Actuation",
  "3.1.1": "Language of Page",
  "3.1.2": "Language of Parts",
  "3.2.1": "On Focus",
  "3.2.2": "On Input",
  "3.2.3": "Consistent Navigation",
  "3.2.4": "Consistent Identification",
  "3.3.1": "Error Identification",
  "3.3.2": "Labels or Instructions",
  "3.3.3": "Error Suggestion",
  "3.3.4": "Error Prevention (Legal, Financial, Data)",
  "4.1.1": "Parsing",
  "4.1.2": "Name, Role, Value",
  "4.1.3": "Status Messages",
};

// Map axe rule IDs → WCAG criteria they test
const AXE_RULE_TO_WCAG: Record<string, string[]> = {
  "image-alt": ["1.1.1"],
  "input-image-alt": ["1.1.1"],
  "area-alt": ["1.1.1"],
  "object-alt": ["1.1.1"],
  "svg-img-alt": ["1.1.1"],
  "role-img-alt": ["1.1.1"],
  "color-contrast": ["1.4.3"],
  "color-contrast-enhanced": ["1.4.6"],
  "link-in-text-block": ["1.4.1"],
  "document-title": ["2.4.2"],
  "html-has-lang": ["3.1.1"],
  "html-lang-valid": ["3.1.1"],
  "valid-lang": ["3.1.2"],
  "bypass": ["2.4.1"],
  "heading-order": ["1.3.1"],
  "list": ["1.3.1"],
  "listitem": ["1.3.1"],
  "definition-list": ["1.3.1"],
  "dlitem": ["1.3.1"],
  "table-fake-caption": ["1.3.1"],
  "td-has-header": ["1.3.1"],
  "th-has-data-cells": ["1.3.1"],
  "aria-allowed-attr": ["4.1.2"],
  "aria-hidden-body": ["4.1.2"],
  "aria-required-attr": ["4.1.2"],
  "aria-required-children": ["4.1.2"],
  "aria-required-parent": ["4.1.2"],
  "aria-roles": ["4.1.2"],
  "aria-valid-attr-value": ["4.1.2"],
  "aria-valid-attr": ["4.1.2"],
  "button-name": ["4.1.2"],
  "input-button-name": ["4.1.2"],
  "label": ["1.3.1", "3.3.2"],
  "select-name": ["4.1.2", "3.3.2"],
  "link-name": ["2.4.4"],
  "frame-title": ["2.4.1"],
  "duplicate-id": ["4.1.1"],
  "duplicate-id-active": ["4.1.1"],
  "duplicate-id-aria": ["4.1.1"],
  "meta-viewport": ["1.4.4"],
  "meta-refresh": ["2.2.1"],
  "tabindex": ["2.4.3"],
  "focus-order-semantics": ["2.4.3"],
  "region": ["2.4.1"],
  "landmark-one-main": ["2.4.1"],
  "page-has-heading-one": ["2.4.6"],
  "empty-heading": ["2.4.6"],
  "form-field-multiple-labels": ["3.3.2"],
  "autocomplete-valid": ["1.3.5"],
  "target-size": ["2.5.5"],
  "nested-interactive": ["4.1.2"],
  "scrollable-region-focusable": ["2.1.1"],
};

// ─── Main Service ────────────────────────────────────────────────────────────

/**
 * Compute the full Regulatory Radar for a workspace.
 */
export async function computeRadar(
  workspaceId: string,
  geos: string[] = ["GLOBAL"],
  industry?: string
): Promise<RadarResult> {
  // 1. Get workspace's recent violations (from last 30 days of scans)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentViolations = await prisma.violation.findMany({
    where: {
      scan: {
        workspaceId,
        status: "COMPLETED",
        createdAt: { gte: thirtyDaysAgo },
      },
    },
    select: {
      ruleId: true,
      impact: true,
      wcagCriteria: true,
      tags: true,
    },
  });

  // 2. Build a map of failing WCAG criteria → violation details
  const failingCriteriaMap = buildFailingCriteriaMap(recentViolations);

  // 3. Get applicable deadlines
  const alerts = getApplicableDeadlines(geos, industry);

  // 4. Compute readiness for each applicable regulation
  const applicableRegulations = REGULATIONS.filter((reg) => {
    const geoMatch = reg.applicability.geos.some(
      (g) => geos.includes(g) || geos.includes("GLOBAL")
    );
    if (!geoMatch) return false;
    if (
      reg.applicability.industries !== "all" &&
      industry &&
      !reg.applicability.industries.includes(industry)
    ) {
      return false;
    }
    return true;
  });

  const radarRegulations: RadarRegulation[] = applicableRegulations.map((reg) =>
    computeRegulationReadiness(reg, failingCriteriaMap, alerts)
  );

  // Sort: non-compliant first, then by days until enforcement
  radarRegulations.sort((a, b) => {
    const statusOrder = { "non-compliant": 0, "at-risk": 1, "compliant": 2 };
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;
    return (a.daysUntilEnforcement ?? 9999) - (b.daysUntilEnforcement ?? 9999);
  });

  // 5. Compute summary
  const summary = computeSummary(radarRegulations, alerts);

  return { summary, regulations: radarRegulations, alerts };
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

interface CriterionFailure {
  criterion: string;
  violationCount: number;
  highestImpact: "critical" | "serious" | "moderate" | "minor";
  ruleIds: Set<string>;
}

function buildFailingCriteriaMap(
  violations: Array<{
    ruleId: string;
    impact: string;
    wcagCriteria: string | null;
    tags: string[];
  }>
): Map<string, CriterionFailure> {
  const map = new Map<string, CriterionFailure>();
  const impactRank: Record<string, number> = { critical: 4, serious: 3, moderate: 2, minor: 1 };

  for (const v of violations) {
    // Determine which WCAG criteria this violation maps to
    const criteria: string[] = [];

    // Use explicit wcagCriteria field if available
    if (v.wcagCriteria) {
      criteria.push(v.wcagCriteria);
    }

    // Also check our axe rule → WCAG mapping
    const mapped = AXE_RULE_TO_WCAG[v.ruleId];
    if (mapped) {
      for (const c of mapped) {
        if (!criteria.includes(c)) criteria.push(c);
      }
    }

    // Update the failing criteria map
    for (const criterion of criteria) {
      const existing = map.get(criterion);
      const impact = v.impact as "critical" | "serious" | "moderate" | "minor";

      if (existing) {
        existing.violationCount++;
        existing.ruleIds.add(v.ruleId);
        if (impactRank[impact] > impactRank[existing.highestImpact]) {
          existing.highestImpact = impact;
        }
      } else {
        map.set(criterion, {
          criterion,
          violationCount: 1,
          highestImpact: impact,
          ruleIds: new Set([v.ruleId]),
        });
      }
    }
  }

  return map;
}

function computeRegulationReadiness(
  reg: Regulation,
  failingCriteriaMap: Map<string, CriterionFailure>,
  alerts: DeadlineAlert[]
): RadarRegulation {
  const requiredCriteria = REGULATION_WCAG_REQUIREMENTS[reg.id] || WCAG_21_AA_CRITERIA;
  const totalRequired = requiredCriteria.length;

  // Find which required criteria are currently failing
  const failing: FailingCriterion[] = [];
  let passingCount = 0;

  for (const criterion of requiredCriteria) {
    const failure = failingCriteriaMap.get(criterion);
    if (failure) {
      failing.push({
        criterion,
        title: WCAG_CRITERION_NAMES[criterion] || criterion,
        violationCount: failure.violationCount,
        impact: failure.highestImpact,
        sampleRuleIds: Array.from(failure.ruleIds).slice(0, 3),
      });
    } else {
      passingCount++;
    }
  }

  // Sort failures by impact (critical first)
  const impactOrder: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  failing.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]);

  // Compute readiness percentage
  const readiness = totalRequired > 0 ? Math.round((passingCount / totalRequired) * 100) : 100;

  // Determine status
  let status: RadarRegulation["status"];
  if (readiness === 100) status = "compliant";
  else if (failing.some((f) => f.impact === "critical" || f.impact === "serious")) status = "non-compliant";
  else status = "at-risk";

  // Find nearest upcoming deadline for this regulation
  const regAlerts = alerts.filter((a) => a.regulationId === reg.id && a.daysUntil > 0);
  const nearestDeadline = regAlerts.length > 0 ? regAlerts[0] : null;

  // Estimate effort
  const totalViolations = failing.reduce((sum, f) => sum + f.violationCount, 0);
  const criticalCount = failing.filter((f) => f.impact === "critical").length;
  const estimatedHours = Math.ceil(
    failing.reduce((sum, f) => {
      const baseHours = f.impact === "critical" ? 4 : f.impact === "serious" ? 2 : 1;
      return sum + baseHours * Math.min(f.violationCount, 5); // cap per-criterion effort
    }, 0)
  );

  const complexity: EffortEstimate["complexity"] =
    criticalCount >= 3 ? "high" : criticalCount >= 1 || failing.length >= 5 ? "medium" : "low";

  return {
    id: reg.id,
    name: reg.name,
    shortName: reg.shortName,
    jurisdiction: reg.jurisdiction,
    region: reg.region,
    readiness,
    status,
    daysUntilEnforcement: nearestDeadline?.daysUntil ?? null,
    enforcementDate: nearestDeadline?.deadline.date ?? null,
    failingCriteria: failing,
    estimatedEffort: {
      totalViolations,
      criticalCount,
      estimatedHours,
      complexity,
    },
    penalties: {
      maxFine: reg.penalties.maxFine,
      privateRightOfAction: reg.penalties.privateRightOfAction,
    },
  };
}

function computeSummary(regulations: RadarRegulation[], alerts: DeadlineAlert[]): RadarSummary {
  const compliant = regulations.filter((r) => r.status === "compliant").length;
  const atRisk = regulations.filter((r) => r.status !== "compliant").length;

  // Critical deadlines: within 90 days AND not compliant
  const nonCompliantIds = new Set(
    regulations.filter((r) => r.status !== "compliant").map((r) => r.id)
  );
  const criticalDeadlines = alerts.filter(
    (a) => a.daysUntil <= 90 && a.daysUntil > 0 && nonCompliantIds.has(a.regulationId)
  ).length;

  // Overall readiness: weighted average (non-compliant regulations weigh more)
  const overallReadiness =
    regulations.length > 0
      ? Math.round(regulations.reduce((sum, r) => sum + r.readiness, 0) / regulations.length)
      : 100;

  // Top priority: non-compliant regulation with nearest deadline
  const topPriority =
    regulations.find((r) => r.status === "non-compliant" && r.daysUntilEnforcement !== null)?.id ??
    regulations.find((r) => r.status === "at-risk")?.id ??
    null;

  return {
    overallReadiness,
    regulationsAtRisk: atRisk,
    regulationsCompliant: compliant,
    criticalDeadlines,
    topPriority,
  };
}
