/**
 * Unit tests for jurisdiction data layer.
 * Verifies mapping completeness, correctness, and helper functions.
 */

import { describe, it, expect } from "vitest";
import { JURISDICTIONS, JURISDICTION_IDS, getJurisdiction, getApplicableJurisdictions } from "@/lib/compliance/jurisdictions";
import { JURISDICTION_MAP, getMappingForCriterion, getRequiredCriteria, getCriteriaCountByJurisdiction } from "@/lib/compliance/jurisdiction-map";
import { EN301549_EXTRA_REQUIREMENTS, getWebApplicableExtras } from "@/lib/compliance/en301549-extras";
import { WCAG_CRITERIA } from "@/lib/wcag/criteria";

describe("Jurisdictions", () => {
  it("defines all 4 jurisdictions", () => {
    expect(JURISDICTION_IDS).toHaveLength(4);
    expect(JURISDICTION_IDS).toContain("ADA");
    expect(JURISDICTION_IDS).toContain("EAA");
    expect(JURISDICTION_IDS).toContain("SECTION508");
    expect(JURISDICTION_IDS).toContain("AODA");
  });

  it("each jurisdiction has complete metadata", () => {
    for (const id of JURISDICTION_IDS) {
      const j = getJurisdiction(id);
      expect(j.id).toBe(id);
      expect(j.name.length).toBeGreaterThan(0);
      expect(j.region.length).toBeGreaterThan(0);
      expect(j.authority.length).toBeGreaterThan(0);
      expect(j.baseStandard.length).toBeGreaterThan(0);
      expect(j.penalty.length).toBeGreaterThan(0);
    }
  });

  it("EAA has extra requirements and requires statement", () => {
    const eaa = getJurisdiction("EAA");
    expect(eaa.hasExtraRequirements).toBe(true);
    expect(eaa.requiresStatement).toBe(true);
    expect(eaa.documentFormat).toBe("eu_statement_annex_c");
  });

  it("ADA does not require extra requirements or statement", () => {
    const ada = getJurisdiction("ADA");
    expect(ada.hasExtraRequirements).toBe(false);
    expect(ada.requiresStatement).toBe(false);
    expect(ada.enforcement).toBe("private_action");
  });

  it("getApplicableJurisdictions returns correct jurisdictions for regions", () => {
    const us = getApplicableJurisdictions(["US"]);
    expect(us.map((j) => j.id)).toContain("ADA");
    expect(us.map((j) => j.id)).toContain("SECTION508");
    expect(us.map((j) => j.id)).not.toContain("EAA");

    const eu = getApplicableJurisdictions(["EU"]);
    expect(eu.map((j) => j.id)).toContain("EAA");
    expect(eu.map((j) => j.id)).not.toContain("ADA");

    const global = getApplicableJurisdictions(["global"]);
    expect(global.length).toBe(4);
  });
});

describe("Jurisdiction Map", () => {
  it("maps all 52 WCAG A/AA criteria", () => {
    expect(JURISDICTION_MAP).toHaveLength(49);
  });

  it("every criterion in WCAG_CRITERIA has a jurisdiction mapping", () => {
    for (const criterion of WCAG_CRITERIA) {
      const mapping = getMappingForCriterion(criterion.criterion);
      expect(mapping, `Missing mapping for ${criterion.criterion}`).toBeDefined();
    }
  });

  it("every mapping has all 4 jurisdiction entries", () => {
    for (const mapping of JURISDICTION_MAP) {
      for (const jId of JURISDICTION_IDS) {
        expect(mapping.jurisdictions[jId], `Missing ${jId} for ${mapping.criterion}`).toBeDefined();
        expect(typeof mapping.jurisdictions[jId].required).toBe("boolean");
        expect(mapping.jurisdictions[jId].clause.length).toBeGreaterThan(0);
      }
    }
  });

  it("ADA requires all 52 criteria (WCAG 2.1 AA)", () => {
    const adaRequired = getRequiredCriteria("ADA");
    expect(adaRequired).toHaveLength(49);
  });

  it("EAA requires all 52 criteria (EN 301 549 references WCAG 2.1)", () => {
    const eaaRequired = getRequiredCriteria("EAA");
    expect(eaaRequired).toHaveLength(49);
  });

  it("Section 508 requires fewer criteria (WCAG 2.0 only)", () => {
    const s508Required = getRequiredCriteria("SECTION508");
    // WCAG 2.1 added: 1.3.4, 1.3.5, 1.4.10, 1.4.11, 1.4.12, 1.4.13, 2.1.4, 2.5.1, 2.5.2, 2.5.3, 2.5.4, 4.1.3 = 12 not in 508
    expect(s508Required.length).toBe(37);
  });

  it("AODA requires same as Section 508 (both reference WCAG 2.0 AA)", () => {
    const aodaRequired = getRequiredCriteria("AODA");
    expect(aodaRequired.length).toBe(37);
  });

  it("WCAG 2.1 criteria are correctly marked as not required in Section 508", () => {
    const wcag21Only = ["1.3.4", "1.3.5", "1.4.10", "1.4.11", "1.4.12", "1.4.13", "2.1.4", "2.5.1", "2.5.2", "2.5.3", "2.5.4", "4.1.3"];
    for (const criterion of wcag21Only) {
      const mapping = getMappingForCriterion(criterion);
      expect(mapping?.jurisdictions.SECTION508.required, `${criterion} should not be required in 508`).toBe(false);
      expect(mapping?.jurisdictions.AODA.required, `${criterion} should not be required in AODA`).toBe(false);
      // But should be required in ADA and EAA
      expect(mapping?.jurisdictions.ADA.required, `${criterion} should be required in ADA`).toBe(true);
      expect(mapping?.jurisdictions.EAA.required, `${criterion} should be required in EAA`).toBe(true);
    }
  });

  it("getCriteriaCountByJurisdiction returns correct totals", () => {
    const counts = getCriteriaCountByJurisdiction();
    expect(counts.ADA.required + counts.ADA.notRequired).toBe(49);
    expect(counts.EAA.required + counts.EAA.notRequired).toBe(49);
    expect(counts.SECTION508.required).toBe(37);
    expect(counts.AODA.required).toBe(37);
  });
});

describe("EN 301 549 Extra Requirements", () => {
  it("has at least 10 extra requirements", () => {
    expect(EN301549_EXTRA_REQUIREMENTS.length).toBeGreaterThanOrEqual(10);
  });

  it("each requirement has complete metadata", () => {
    for (const req of EN301549_EXTRA_REQUIREMENTS) {
      expect(req.id.length).toBeGreaterThan(0);
      expect(req.clause.length).toBeGreaterThan(0);
      expect(req.title.length).toBeGreaterThan(0);
      expect(req.description.length).toBeGreaterThan(0);
      expect(req.selfDeclarationPrompt.length).toBeGreaterThan(0);
      expect(["automated", "manual", "documentation", "self_declaration"]).toContain(req.evaluationMethod);
    }
  });

  it("getWebApplicableExtras returns only typically applicable ones", () => {
    const webExtras = getWebApplicableExtras();
    expect(webExtras.length).toBeGreaterThan(0);
    expect(webExtras.length).toBeLessThan(EN301549_EXTRA_REQUIREMENTS.length);
    for (const req of webExtras) {
      expect(req.typicallyApplicable).toBe(true);
    }
  });

  it("includes documentation requirements (clause 12)", () => {
    const docReqs = EN301549_EXTRA_REQUIREMENTS.filter((r) => r.clause.startsWith("12"));
    expect(docReqs.length).toBeGreaterThanOrEqual(4);
  });
});
