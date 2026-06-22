/**
 * WHY: Each WCAG criterion has different applicability and clause references across
 *      jurisdictions. This mapping is the intellectual property of the compliance engine.
 * WHAT: Maps all 52 WCAG 2.1 A/AA criteria to their status in ADA, EAA, Section 508, AODA.
 * HOW: Pure constant — no imports beyond types. Used by the evaluator to determine
 *      per-jurisdiction conformance from scan results.
 */

import type { JurisdictionId } from "./jurisdictions";

export interface CriterionJurisdictionInfo {
  required: boolean;
  /** The clause/reference in this jurisdiction's standard */
  clause: string;
  /** Any notes about interpretation differences */
  notes?: string;
}

export interface CriterionMapping {
  criterion: string;
  jurisdictions: Record<JurisdictionId, CriterionJurisdictionInfo>;
}

/**
 * Complete mapping of WCAG 2.1 A/AA criteria to jurisdiction requirements.
 *
 * Key interpretation differences:
 * - ADA: Courts interpret via WCAG 2.1 AA (DOJ 2022 guidance), no statutory WCAG version
 * - EAA/EN 301 549: References WCAG 2.1 AA via clause 9, adds extra requirements
 * - Section 508 (2017 refresh): References WCAG 2.0 AA — some 2.1 criteria NOT required
 * - AODA (IASR): References WCAG 2.0 AA — some 2.1 criteria NOT required
 */
export const JURISDICTION_MAP: CriterionMapping[] = [
  // ─── Perceivable ───────────────────────────────────────────────────────────
  { criterion: "1.1.1", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §1.1.1" },
    EAA: { required: true, clause: "EN 301 549 §9.1.1.1" },
    SECTION508: { required: true, clause: "36 CFR 1194 → WCAG 2.0 §1.1.1" },
    AODA: { required: true, clause: "WCAG 2.0 §1.1.1" },
  }},
  { criterion: "1.2.1", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §1.2.1" },
    EAA: { required: true, clause: "EN 301 549 §9.1.2.1" },
    SECTION508: { required: true, clause: "WCAG 2.0 §1.2.1" },
    AODA: { required: true, clause: "WCAG 2.0 §1.2.1" },
  }},
  { criterion: "1.2.2", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §1.2.2" },
    EAA: { required: true, clause: "EN 301 549 §9.1.2.2" },
    SECTION508: { required: true, clause: "WCAG 2.0 §1.2.2" },
    AODA: { required: true, clause: "WCAG 2.0 §1.2.2" },
  }},
  { criterion: "1.2.3", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §1.2.3" },
    EAA: { required: true, clause: "EN 301 549 §9.1.2.3" },
    SECTION508: { required: true, clause: "WCAG 2.0 §1.2.3" },
    AODA: { required: true, clause: "WCAG 2.0 §1.2.3" },
  }},
  { criterion: "1.2.5", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §1.2.5" },
    EAA: { required: true, clause: "EN 301 549 §9.1.2.5" },
    SECTION508: { required: true, clause: "WCAG 2.0 §1.2.5" },
    AODA: { required: true, clause: "WCAG 2.0 §1.2.5" },
  }},
  { criterion: "1.3.1", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §1.3.1" },
    EAA: { required: true, clause: "EN 301 549 §9.1.3.1" },
    SECTION508: { required: true, clause: "WCAG 2.0 §1.3.1" },
    AODA: { required: true, clause: "WCAG 2.0 §1.3.1" },
  }},
  { criterion: "1.3.2", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §1.3.2" },
    EAA: { required: true, clause: "EN 301 549 §9.1.3.2" },
    SECTION508: { required: true, clause: "WCAG 2.0 §1.3.2" },
    AODA: { required: true, clause: "WCAG 2.0 §1.3.2" },
  }},
  { criterion: "1.3.3", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §1.3.3" },
    EAA: { required: true, clause: "EN 301 549 §9.1.3.3" },
    SECTION508: { required: true, clause: "WCAG 2.0 §1.3.3" },
    AODA: { required: true, clause: "WCAG 2.0 §1.3.3" },
  }},
  { criterion: "1.3.4", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §1.3.4" },
    EAA: { required: true, clause: "EN 301 549 §9.1.3.4" },
    SECTION508: { required: false, clause: "N/A", notes: "WCAG 2.1 criterion — not in Section 508 (2017 refresh references WCAG 2.0)" },
    AODA: { required: false, clause: "N/A", notes: "WCAG 2.1 criterion — not in AODA (references WCAG 2.0)" },
  }},
  { criterion: "1.3.5", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §1.3.5" },
    EAA: { required: true, clause: "EN 301 549 §9.1.3.5" },
    SECTION508: { required: false, clause: "N/A", notes: "WCAG 2.1 criterion — not in Section 508" },
    AODA: { required: false, clause: "N/A", notes: "WCAG 2.1 criterion — not in AODA" },
  }},
  { criterion: "1.4.1", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §1.4.1" },
    EAA: { required: true, clause: "EN 301 549 §9.1.4.1" },
    SECTION508: { required: true, clause: "WCAG 2.0 §1.4.1" },
    AODA: { required: true, clause: "WCAG 2.0 §1.4.1" },
  }},
  { criterion: "1.4.2", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §1.4.2" },
    EAA: { required: true, clause: "EN 301 549 §9.1.4.2" },
    SECTION508: { required: true, clause: "WCAG 2.0 §1.4.2" },
    AODA: { required: true, clause: "WCAG 2.0 §1.4.2" },
  }},
  { criterion: "1.4.3", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §1.4.3" },
    EAA: { required: true, clause: "EN 301 549 §9.1.4.3" },
    SECTION508: { required: true, clause: "WCAG 2.0 §1.4.3" },
    AODA: { required: true, clause: "WCAG 2.0 §1.4.3" },
  }},
  { criterion: "1.4.4", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §1.4.4" },
    EAA: { required: true, clause: "EN 301 549 §9.1.4.4" },
    SECTION508: { required: true, clause: "WCAG 2.0 §1.4.4" },
    AODA: { required: true, clause: "WCAG 2.0 §1.4.4" },
  }},
  { criterion: "1.4.5", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §1.4.5" },
    EAA: { required: true, clause: "EN 301 549 §9.1.4.5" },
    SECTION508: { required: true, clause: "WCAG 2.0 §1.4.5" },
    AODA: { required: true, clause: "WCAG 2.0 §1.4.5" },
  }},
  { criterion: "1.4.10", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §1.4.10" },
    EAA: { required: true, clause: "EN 301 549 §9.1.4.10" },
    SECTION508: { required: false, clause: "N/A", notes: "WCAG 2.1 criterion" },
    AODA: { required: false, clause: "N/A", notes: "WCAG 2.1 criterion" },
  }},
  { criterion: "1.4.11", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §1.4.11" },
    EAA: { required: true, clause: "EN 301 549 §9.1.4.11" },
    SECTION508: { required: false, clause: "N/A", notes: "WCAG 2.1 criterion" },
    AODA: { required: false, clause: "N/A", notes: "WCAG 2.1 criterion" },
  }},
  { criterion: "1.4.12", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §1.4.12" },
    EAA: { required: true, clause: "EN 301 549 §9.1.4.12" },
    SECTION508: { required: false, clause: "N/A", notes: "WCAG 2.1 criterion" },
    AODA: { required: false, clause: "N/A", notes: "WCAG 2.1 criterion" },
  }},
  { criterion: "1.4.13", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §1.4.13" },
    EAA: { required: true, clause: "EN 301 549 §9.1.4.13" },
    SECTION508: { required: false, clause: "N/A", notes: "WCAG 2.1 criterion" },
    AODA: { required: false, clause: "N/A", notes: "WCAG 2.1 criterion" },
  }},
  // ─── Operable ──────────────────────────────────────────────────────────────
  { criterion: "2.1.1", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §2.1.1" },
    EAA: { required: true, clause: "EN 301 549 §9.2.1.1" },
    SECTION508: { required: true, clause: "WCAG 2.0 §2.1.1" },
    AODA: { required: true, clause: "WCAG 2.0 §2.1.1" },
  }},
  { criterion: "2.1.2", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §2.1.2" },
    EAA: { required: true, clause: "EN 301 549 §9.2.1.2" },
    SECTION508: { required: true, clause: "WCAG 2.0 §2.1.2" },
    AODA: { required: true, clause: "WCAG 2.0 §2.1.2" },
  }},
  { criterion: "2.1.4", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §2.1.4" },
    EAA: { required: true, clause: "EN 301 549 §9.2.1.4" },
    SECTION508: { required: false, clause: "N/A", notes: "WCAG 2.1 criterion" },
    AODA: { required: false, clause: "N/A", notes: "WCAG 2.1 criterion" },
  }},
  { criterion: "2.2.1", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §2.2.1" },
    EAA: { required: true, clause: "EN 301 549 §9.2.2.1" },
    SECTION508: { required: true, clause: "WCAG 2.0 §2.2.1" },
    AODA: { required: true, clause: "WCAG 2.0 §2.2.1" },
  }},
  { criterion: "2.2.2", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §2.2.2" },
    EAA: { required: true, clause: "EN 301 549 §9.2.2.2" },
    SECTION508: { required: true, clause: "WCAG 2.0 §2.2.2" },
    AODA: { required: true, clause: "WCAG 2.0 §2.2.2" },
  }},
  { criterion: "2.3.1", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §2.3.1" },
    EAA: { required: true, clause: "EN 301 549 §9.2.3.1" },
    SECTION508: { required: true, clause: "WCAG 2.0 §2.3.1" },
    AODA: { required: true, clause: "WCAG 2.0 §2.3.1" },
  }},
  { criterion: "2.4.1", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §2.4.1" },
    EAA: { required: true, clause: "EN 301 549 §9.2.4.1" },
    SECTION508: { required: true, clause: "WCAG 2.0 §2.4.1" },
    AODA: { required: true, clause: "WCAG 2.0 §2.4.1" },
  }},
  { criterion: "2.4.2", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §2.4.2" },
    EAA: { required: true, clause: "EN 301 549 §9.2.4.2" },
    SECTION508: { required: true, clause: "WCAG 2.0 §2.4.2" },
    AODA: { required: true, clause: "WCAG 2.0 §2.4.2" },
  }},
  { criterion: "2.4.3", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §2.4.3" },
    EAA: { required: true, clause: "EN 301 549 §9.2.4.3" },
    SECTION508: { required: true, clause: "WCAG 2.0 §2.4.3" },
    AODA: { required: true, clause: "WCAG 2.0 §2.4.3" },
  }},
  { criterion: "2.4.4", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §2.4.4" },
    EAA: { required: true, clause: "EN 301 549 §9.2.4.4" },
    SECTION508: { required: true, clause: "WCAG 2.0 §2.4.4" },
    AODA: { required: true, clause: "WCAG 2.0 §2.4.4" },
  }},
  { criterion: "2.4.5", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §2.4.5" },
    EAA: { required: true, clause: "EN 301 549 §9.2.4.5" },
    SECTION508: { required: true, clause: "WCAG 2.0 §2.4.5" },
    AODA: { required: true, clause: "WCAG 2.0 §2.4.5" },
  }},
  { criterion: "2.4.6", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §2.4.6" },
    EAA: { required: true, clause: "EN 301 549 §9.2.4.6" },
    SECTION508: { required: true, clause: "WCAG 2.0 §2.4.6" },
    AODA: { required: true, clause: "WCAG 2.0 §2.4.6" },
  }},
  { criterion: "2.4.7", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §2.4.7" },
    EAA: { required: true, clause: "EN 301 549 §9.2.4.7" },
    SECTION508: { required: true, clause: "WCAG 2.0 §2.4.7" },
    AODA: { required: true, clause: "WCAG 2.0 §2.4.7" },
  }},
  { criterion: "2.5.1", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §2.5.1" },
    EAA: { required: true, clause: "EN 301 549 §9.2.5.1" },
    SECTION508: { required: false, clause: "N/A", notes: "WCAG 2.1 criterion" },
    AODA: { required: false, clause: "N/A", notes: "WCAG 2.1 criterion" },
  }},
  { criterion: "2.5.2", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §2.5.2" },
    EAA: { required: true, clause: "EN 301 549 §9.2.5.2" },
    SECTION508: { required: false, clause: "N/A", notes: "WCAG 2.1 criterion" },
    AODA: { required: false, clause: "N/A", notes: "WCAG 2.1 criterion" },
  }},
  { criterion: "2.5.3", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §2.5.3" },
    EAA: { required: true, clause: "EN 301 549 §9.2.5.3" },
    SECTION508: { required: false, clause: "N/A", notes: "WCAG 2.1 criterion" },
    AODA: { required: false, clause: "N/A", notes: "WCAG 2.1 criterion" },
  }},
  { criterion: "2.5.4", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §2.5.4" },
    EAA: { required: true, clause: "EN 301 549 §9.2.5.4" },
    SECTION508: { required: false, clause: "N/A", notes: "WCAG 2.1 criterion" },
    AODA: { required: false, clause: "N/A", notes: "WCAG 2.1 criterion" },
  }},
  // ─── Understandable ────────────────────────────────────────────────────────
  { criterion: "3.1.1", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §3.1.1" },
    EAA: { required: true, clause: "EN 301 549 §9.3.1.1" },
    SECTION508: { required: true, clause: "WCAG 2.0 §3.1.1" },
    AODA: { required: true, clause: "WCAG 2.0 §3.1.1" },
  }},
  { criterion: "3.1.2", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §3.1.2" },
    EAA: { required: true, clause: "EN 301 549 §9.3.1.2" },
    SECTION508: { required: true, clause: "WCAG 2.0 §3.1.2" },
    AODA: { required: true, clause: "WCAG 2.0 §3.1.2" },
  }},
  { criterion: "3.2.1", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §3.2.1" },
    EAA: { required: true, clause: "EN 301 549 §9.3.2.1" },
    SECTION508: { required: true, clause: "WCAG 2.0 §3.2.1" },
    AODA: { required: true, clause: "WCAG 2.0 §3.2.1" },
  }},
  { criterion: "3.2.2", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §3.2.2" },
    EAA: { required: true, clause: "EN 301 549 §9.3.2.2" },
    SECTION508: { required: true, clause: "WCAG 2.0 §3.2.2" },
    AODA: { required: true, clause: "WCAG 2.0 §3.2.2" },
  }},
  { criterion: "3.2.3", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §3.2.3" },
    EAA: { required: true, clause: "EN 301 549 §9.3.2.3" },
    SECTION508: { required: true, clause: "WCAG 2.0 §3.2.3" },
    AODA: { required: true, clause: "WCAG 2.0 §3.2.3" },
  }},
  { criterion: "3.2.4", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §3.2.4" },
    EAA: { required: true, clause: "EN 301 549 §9.3.2.4" },
    SECTION508: { required: true, clause: "WCAG 2.0 §3.2.4" },
    AODA: { required: true, clause: "WCAG 2.0 §3.2.4" },
  }},
  { criterion: "3.3.1", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §3.3.1" },
    EAA: { required: true, clause: "EN 301 549 §9.3.3.1" },
    SECTION508: { required: true, clause: "WCAG 2.0 §3.3.1" },
    AODA: { required: true, clause: "WCAG 2.0 §3.3.1" },
  }},
  { criterion: "3.3.2", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §3.3.2" },
    EAA: { required: true, clause: "EN 301 549 §9.3.3.2" },
    SECTION508: { required: true, clause: "WCAG 2.0 §3.3.2" },
    AODA: { required: true, clause: "WCAG 2.0 §3.3.2" },
  }},
  { criterion: "3.3.3", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §3.3.3" },
    EAA: { required: true, clause: "EN 301 549 §9.3.3.3" },
    SECTION508: { required: true, clause: "WCAG 2.0 §3.3.3" },
    AODA: { required: true, clause: "WCAG 2.0 §3.3.3" },
  }},
  { criterion: "3.3.4", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §3.3.4" },
    EAA: { required: true, clause: "EN 301 549 §9.3.3.4" },
    SECTION508: { required: true, clause: "WCAG 2.0 §3.3.4" },
    AODA: { required: true, clause: "WCAG 2.0 §3.3.4" },
  }},
  // ─── Robust ────────────────────────────────────────────────────────────────
  { criterion: "4.1.1", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §4.1.1", notes: "Deprecated in WCAG 2.2 but still referenced by ADA case law" },
    EAA: { required: true, clause: "EN 301 549 §9.4.1.1", notes: "EN 301 549 v3.2.1 still includes this" },
    SECTION508: { required: true, clause: "WCAG 2.0 §4.1.1" },
    AODA: { required: true, clause: "WCAG 2.0 §4.1.1" },
  }},
  { criterion: "4.1.2", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §4.1.2" },
    EAA: { required: true, clause: "EN 301 549 §9.4.1.2" },
    SECTION508: { required: true, clause: "WCAG 2.0 §4.1.2" },
    AODA: { required: true, clause: "WCAG 2.0 §4.1.2" },
  }},
  { criterion: "4.1.3", jurisdictions: {
    ADA: { required: true, clause: "WCAG 2.1 §4.1.3" },
    EAA: { required: true, clause: "EN 301 549 §9.4.1.3" },
    SECTION508: { required: false, clause: "N/A", notes: "WCAG 2.1 criterion — not in Section 508" },
    AODA: { required: false, clause: "N/A", notes: "WCAG 2.1 criterion — not in AODA" },
  }},
];

/** Get the jurisdiction mapping for a specific criterion */
export function getMappingForCriterion(criterion: string): CriterionMapping | undefined {
  return JURISDICTION_MAP.find((m) => m.criterion === criterion);
}

/** Get all criteria required by a specific jurisdiction */
export function getRequiredCriteria(jurisdictionId: JurisdictionId): string[] {
  return JURISDICTION_MAP
    .filter((m) => m.jurisdictions[jurisdictionId].required)
    .map((m) => m.criterion);
}

/** Count of criteria per jurisdiction */
export function getCriteriaCountByJurisdiction(): Record<JurisdictionId, { required: number; notRequired: number }> {
  const counts = { ADA: { required: 0, notRequired: 0 }, EAA: { required: 0, notRequired: 0 }, SECTION508: { required: 0, notRequired: 0 }, AODA: { required: 0, notRequired: 0 } };
  for (const mapping of JURISDICTION_MAP) {
    for (const jId of ["ADA", "EAA", "SECTION508", "AODA"] as JurisdictionId[]) {
      if (mapping.jurisdictions[jId].required) counts[jId].required++;
      else counts[jId].notRequired++;
    }
  }
  return counts;
}
