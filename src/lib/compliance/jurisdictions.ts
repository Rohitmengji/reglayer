/**
 * WHY: Enterprises face simultaneous compliance requirements across multiple jurisdictions.
 *      A single source of truth for jurisdiction definitions prevents drift and enables
 *      the evaluator to produce per-jurisdiction assessments from one scan.
 * WHAT: Jurisdiction definitions, enforcement types, scope, and regulatory metadata.
 * HOW: Pure constants — no Prisma, no server imports, fully unit-testable.
 */

export type JurisdictionId = "ADA" | "EAA" | "SECTION508" | "AODA";
export type EnforcementType = "private_action" | "government" | "market_surveillance";
export type ConformanceStatus = "supports" | "partially_supports" | "does_not_support" | "not_applicable" | "not_evaluated";

export interface Jurisdiction {
  id: JurisdictionId;
  name: string;
  fullName: string;
  region: string;
  authority: string;
  enforcement: EnforcementType;
  baseStandard: string;
  baseStandardVersion: string;
  /** Extra requirements beyond WCAG (e.g., EN 301 549 clauses) */
  hasExtraRequirements: boolean;
  /** Whether the jurisdiction requires a published accessibility statement */
  requiresStatement: boolean;
  /** Document format this jurisdiction expects */
  documentFormat: "vpat_2_4" | "eu_statement_annex_c" | "aoda_report";
  /** Brief description of scope */
  scope: string;
  /** Maximum fine or penalty description */
  penalty: string;
  /** Effective/enforcement date */
  effectiveDate: string;
}

export const JURISDICTIONS: Record<JurisdictionId, Jurisdiction> = {
  ADA: {
    id: "ADA",
    name: "ADA Title III",
    fullName: "Americans with Disabilities Act, Title III",
    region: "United States",
    authority: "U.S. Department of Justice",
    enforcement: "private_action",
    baseStandard: "WCAG",
    baseStandardVersion: "2.1 AA",
    hasExtraRequirements: false,
    requiresStatement: false,
    documentFormat: "vpat_2_4",
    scope: "All public accommodations operating websites or mobile apps serving the US market",
    penalty: "Statutory damages + injunctive relief + attorney fees ($10K-$500K+ settlements typical)",
    effectiveDate: "1990-07-26",
  },
  EAA: {
    id: "EAA",
    name: "European Accessibility Act",
    fullName: "Directive (EU) 2019/882 — European Accessibility Act",
    region: "European Union (27 member states)",
    authority: "National Market Surveillance Authorities",
    enforcement: "market_surveillance",
    baseStandard: "EN 301 549",
    baseStandardVersion: "v3.2.1 (2021)",
    hasExtraRequirements: true,
    requiresStatement: true,
    documentFormat: "eu_statement_annex_c",
    scope: "Products and services: e-commerce, banking, transport, e-books, audiovisual media services, telephony",
    penalty: "Member state penalties (vary: €10K-€500K+ fines, market withdrawal orders)",
    effectiveDate: "2025-06-28",
  },
  SECTION508: {
    id: "SECTION508",
    name: "Section 508",
    fullName: "Section 508 of the Rehabilitation Act (Revised 2017)",
    region: "United States (Federal)",
    authority: "U.S. Access Board / GSA",
    enforcement: "government",
    baseStandard: "WCAG",
    baseStandardVersion: "2.0 AA",
    hasExtraRequirements: false,
    requiresStatement: false,
    documentFormat: "vpat_2_4",
    scope: "Federal agencies and their contractors/vendors. Required for government procurement (FAR).",
    penalty: "Contract loss + administrative complaints + lawsuits under Section 504",
    effectiveDate: "2018-01-18",
  },
  AODA: {
    id: "AODA",
    name: "AODA",
    fullName: "Accessibility for Ontarians with Disabilities Act (IASR)",
    region: "Ontario, Canada",
    authority: "Government of Ontario",
    enforcement: "government",
    baseStandard: "WCAG",
    baseStandardVersion: "2.0 AA",
    hasExtraRequirements: false,
    requiresStatement: true,
    documentFormat: "aoda_report",
    scope: "All organizations with 50+ employees in Ontario. New websites must conform.",
    penalty: "Up to $100K/day for corporations; $50K/day for individuals/unincorporated orgs",
    effectiveDate: "2021-01-01",
  },
};

/** All jurisdiction IDs in display order */
export const JURISDICTION_IDS: JurisdictionId[] = ["ADA", "EAA", "SECTION508", "AODA"];

/** Get a jurisdiction by ID */
export function getJurisdiction(id: JurisdictionId): Jurisdiction {
  return JURISDICTIONS[id];
}

/** Get jurisdictions that apply to a given region set */
export function getApplicableJurisdictions(regions: string[]): Jurisdiction[] {
  const normalized = regions.map((r) => r.toLowerCase());
  return JURISDICTION_IDS.map((id) => JURISDICTIONS[id]).filter((j) => {
    const jRegion = j.region.toLowerCase();
    return normalized.some((r) =>
      r === "us" && (j.id === "ADA" || j.id === "SECTION508") ||
      r === "eu" && j.id === "EAA" ||
      r === "ca" && j.id === "AODA" ||
      r === "global" // global = all jurisdictions
    );
  });
}
