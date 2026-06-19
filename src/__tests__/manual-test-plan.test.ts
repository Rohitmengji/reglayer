/**
 * Unit tests for manual test plan generator.
 * Tests partition correctness, evidence binding, and litigation-risk ordering.
 */

import { describe, it, expect } from "vitest";
import { buildTestPlan, type SnapshotForPlan } from "@/lib/testing/manualTestPlan";
import { MANUAL_ONLY_CRITERIA, WCAG_CRITERIA } from "@/lib/wcag/criteria";

describe("buildTestPlan", () => {
  it("includes all MANUAL_ONLY criteria even when automation covers them", () => {
    // Pretend automation covered everything
    const allCriteria = new Set(WCAG_CRITERIA.map((c) => c.criterion));
    const plan = buildTestPlan(allCriteria, "scan_test123");

    // Even with full automation coverage, manual-only criteria must still appear
    for (const criterion of MANUAL_ONLY_CRITERIA) {
      const found = plan.items.find((item) => item.criterion === criterion);
      expect(found, `Expected ${criterion} to be in plan`).toBeDefined();
    }
  });

  it("includes uncovered criteria that are NOT in MANUAL_ONLY", () => {
    // Cover only a few criteria
    const covered = new Set(["1.4.3", "1.4.10", "1.4.11"]);
    const plan = buildTestPlan(covered, "scan_test456");

    // 1.4.3 is NOT in MANUAL_ONLY, and it IS covered → should NOT be in plan
    const contrast = plan.items.find((item) => item.criterion === "1.4.3");
    expect(contrast).toBeUndefined();

    // 2.2.1 is NOT in MANUAL_ONLY and NOT covered → should be in plan
    const timing = plan.items.find((item) => item.criterion === "2.2.1");
    expect(timing).toBeDefined();
  });

  it("does not include AAA criteria", () => {
    const plan = buildTestPlan(new Set(), "scan_aaa");
    const levels = new Set(plan.items.map((i) => i.level));
    expect(levels.has("A")).toBe(true);
    expect(levels.has("AA")).toBe(true);
    // No AAA should ever appear (WCAG_CRITERIA only has A/AA but verifying)
    expect(plan.items.every((i) => i.level === "A" || i.level === "AA")).toBe(true);
  });

  it("orders items by litigation weight (highest risk first)", () => {
    const plan = buildTestPlan(new Set(), "scan_order");
    // 1.1.1 (weight 95) should come before 3.2.3 (weight 30 default)
    const idx111 = plan.items.findIndex((i) => i.criterion === "1.1.1");
    const idx323 = plan.items.findIndex((i) => i.criterion === "3.2.3");
    expect(idx111).toBeLessThan(idx323);
  });

  it("binds narration evidence for focus-order criteria", () => {
    const snapshot: SnapshotForPlan = {
      capturedAt: "2024-01-01T00:00:00Z",
      totalElements: 50,
      steps: [
        { index: 0, role: "button", name: "Submit", isInteractive: true },
        { index: 1, role: "link", name: "Home", isInteractive: true },
        { index: 2, role: "heading", name: "Title", isInteractive: false },
        { index: 3, role: "img", name: "Logo", isInteractive: false },
      ],
    };

    const plan = buildTestPlan(new Set(), "scan_evidence", snapshot);

    // 2.4.3 (Focus Order) should have interactive steps as evidence
    const focusOrder = plan.items.find((i) => i.criterion === "2.4.3");
    expect(focusOrder?.evidence.kind).toBe("narration");
    expect(focusOrder?.evidence.steps).toEqual([0, 1]);

    // 1.1.1 (Non-text Content) should have image steps
    const altText = plan.items.find((i) => i.criterion === "1.1.1");
    expect(altText?.evidence.kind).toBe("narration");
    expect(altText?.evidence.steps).toEqual([3]);
  });

  it("sets snapshotRef when snapshot is provided", () => {
    const snapshot: SnapshotForPlan = {
      capturedAt: "2024-06-01T12:00:00Z",
      totalElements: 100,
      steps: [],
    };
    const plan = buildTestPlan(new Set(), "scan_ref", snapshot);
    expect(plan.snapshotRef).toEqual({ capturedAt: "2024-06-01T12:00:00Z", totalElements: 100 });
  });

  it("sets snapshotRef to null when no snapshot", () => {
    const plan = buildTestPlan(new Set(), "scan_noref");
    expect(plan.snapshotRef).toBeNull();
  });

  it("all items start as untested with no attestation", () => {
    const plan = buildTestPlan(new Set(), "scan_verdicts");
    for (const item of plan.items) {
      expect(item.verdict).toBe("untested");
      expect(item.attestedBy).toBeNull();
      expect(item.attestedAt).toBeNull();
      expect(item.note).toBeNull();
    }
  });

  it("all items have static guidance (aiGenerated = false)", () => {
    const plan = buildTestPlan(new Set(), "scan_guidance");
    for (const item of plan.items) {
      expect(item.aiGenerated).toBe(false);
      expect(item.guidance.length).toBeGreaterThan(0);
    }
  });
});
