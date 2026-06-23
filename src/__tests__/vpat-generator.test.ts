/**
 * Unit tests for the VPAT/ACR generator's conformance logic.
 *
 * Focus: F008 — automated scanning must NOT assert "Supports" for criteria it
 * cannot actually verify (manual-only criteria). Absence of automated violations
 * is only evidence of conformance for machine-testable criteria; everything else
 * must read "Not Evaluated" unless a human verdict overrides it.
 */

import { describe, it, expect } from "vitest";
import { generateVPAT, type VPATInput } from "@/lib/compliance/vpat-generator";
import { isManualOnly } from "@/lib/wcag/criteria";

const baseScan = {
  url: "https://example.com",
  score: 100,
  totalViolations: 0,
  violations: [],
  scanDate: "2026-06-23",
};

function gen(extra: Partial<VPATInput> = {}) {
  return generateVPAT({
    productName: "Test Product",
    vendorName: "Test Vendor",
    scanData: baseScan,
    standard: "WCAG21-AA",
    ...extra,
  });
}

describe("generateVPAT — F008 testability-aware conformance", () => {
  it("marks a manual-only criterion 'Not Evaluated' (not 'Supports') when automation finds nothing", () => {
    const doc = gen();
    // 2.1.1 Keyboard is manual-only — axe cannot verify full keyboard operation.
    const c = doc.criteria.find((x) => x.id === "2.1.1");
    expect(c?.conformance).toBe("Not Evaluated");
  });

  it("marks a machine-testable criterion 'Supports' when automation finds no violations", () => {
    const doc = gen();
    // 1.4.3 Contrast is machine-testable (axe color-contrast rule).
    const c = doc.criteria.find((x) => x.id === "1.4.3");
    expect(c?.conformance).toBe("Supports");
  });

  it("never asserts 'Supports' for an unevaluated manual-only criterion, and counts them", () => {
    const doc = gen();
    for (const c of doc.criteria) {
      if (isManualOnly(c.id)) {
        // No human verdicts supplied → manual-only criteria must not claim Supports.
        expect(c.conformance).not.toBe("Supports");
      }
    }
    expect(doc.summary.notEvaluatedCriteria).toBeGreaterThan(0);
  });

  it("honors a human verdict override (manual pass → Supports) for a manual-only criterion", () => {
    const doc = gen({ manualVerdicts: [{ criterion: "2.1.1", verdict: "pass" }] });
    const c = doc.criteria.find((x) => x.id === "2.1.1");
    expect(c?.conformance).toBe("Supports");
  });

  it("still reports real automated violations as a non-conformance", () => {
    const doc = gen({
      scanData: {
        ...baseScan,
        score: 40,
        totalViolations: 1,
        violations: [
          {
            ruleId: "color-contrast",
            impact: "serious",
            wcagCriteria: ["1.4.3"],
            description: "Low contrast",
            help: "Elements must meet contrast ratio",
            affectedCount: 5,
          },
        ],
      },
    });
    const c = doc.criteria.find((x) => x.id === "1.4.3");
    expect(c?.conformance === "Partially Supports" || c?.conformance === "Does Not Support").toBe(true);
  });
});
