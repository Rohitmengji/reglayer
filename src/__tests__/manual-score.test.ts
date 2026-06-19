/**
 * Unit tests for manual score rollup and score combination.
 */

import { describe, it, expect } from "vitest";
import { rollupManualScore, combineScores } from "@/lib/testing/manualScore";
import type { ManualTestItem } from "@/lib/testing/manualTestPlan";

function makeItem(verdict: ManualTestItem["verdict"]): ManualTestItem {
  return {
    criterion: "1.1.1",
    level: "A",
    title: "Test",
    principle: "Perceivable",
    why: "test",
    guidance: "test",
    aiGenerated: false,
    evidence: { kind: "none" },
    verdict,
    note: verdict === "fail" ? "Found issue" : null,
    attestedBy: verdict !== "untested" ? "user_1" : null,
    attestedAt: verdict !== "untested" ? "2024-01-01T00:00:00Z" : null,
  };
}

describe("rollupManualScore", () => {
  it("returns 0 when all items are untested", () => {
    const items = [makeItem("untested"), makeItem("untested"), makeItem("untested")];
    const result = rollupManualScore(items);
    expect(result.score).toBe(0);
    expect(result.evaluated).toBe(0);
    expect(result.counts.untested).toBe(3);
  });

  it("returns 100 when all evaluated items pass", () => {
    const items = [makeItem("pass"), makeItem("pass"), makeItem("na")];
    const result = rollupManualScore(items);
    expect(result.score).toBe(100);
    expect(result.evaluated).toBe(2);
    expect(result.counts.na).toBe(1);
  });

  it("returns 0 when all evaluated items fail", () => {
    const items = [makeItem("fail"), makeItem("fail")];
    const result = rollupManualScore(items);
    expect(result.score).toBe(0);
    expect(result.evaluated).toBe(2);
  });

  it("calculates mixed verdicts correctly", () => {
    const items = [makeItem("pass"), makeItem("pass"), makeItem("fail"), makeItem("na"), makeItem("untested")];
    const result = rollupManualScore(items);
    // 2 pass, 1 fail → 2/3 = 67%
    expect(result.score).toBe(67);
    expect(result.evaluated).toBe(3);
    expect(result.counts.pass).toBe(2);
    expect(result.counts.fail).toBe(1);
    expect(result.counts.na).toBe(1);
    expect(result.counts.untested).toBe(1);
    expect(result.counts.total).toBe(5);
  });

  it("excludes NA from score calculation", () => {
    const items = [makeItem("pass"), makeItem("na"), makeItem("na"), makeItem("na")];
    const result = rollupManualScore(items);
    // Only 1 pass evaluated → 100%
    expect(result.score).toBe(100);
    expect(result.evaluated).toBe(1);
  });
});

describe("combineScores", () => {
  it("returns automated score when no manual items evaluated", () => {
    const manual = rollupManualScore([makeItem("untested"), makeItem("untested")]);
    const result = combineScores(85, 20, manual);
    expect(result.combinedScore).toBe(85);
  });

  it("returns manual score when no automated criteria", () => {
    const manual = rollupManualScore([makeItem("pass"), makeItem("pass"), makeItem("fail")]);
    const result = combineScores(0, 0, manual);
    expect(result.combinedScore).toBe(67); // 2/3
  });

  it("returns 0 when nothing is evaluated", () => {
    const manual = rollupManualScore([makeItem("untested")]);
    const result = combineScores(0, 0, manual);
    expect(result.combinedScore).toBe(0);
  });

  it("weights by criteria count", () => {
    // Auto: 90 score covering 20 criteria
    // Manual: 50 score covering 10 criteria (5 pass, 5 fail)
    const items = [
      ...Array(5).fill(null).map(() => makeItem("pass")),
      ...Array(5).fill(null).map(() => makeItem("fail")),
    ];
    const manual = rollupManualScore(items);
    expect(manual.score).toBe(50);
    expect(manual.evaluated).toBe(10);

    const result = combineScores(90, 20, manual);
    // (90*20 + 50*10) / (20+10) = (1800+500)/30 = 2300/30 = 76.67 → 77
    expect(result.combinedScore).toBe(77);
  });

  it("includes breakdown for transparency", () => {
    const manual = rollupManualScore([makeItem("pass")]);
    const result = combineScores(80, 15, manual);
    expect(result.breakdown.automatedScore).toBe(80);
    expect(result.breakdown.automatedCriteriaCount).toBe(15);
    expect(result.breakdown.manualScore).toBe(100);
    expect(result.breakdown.manualCriteriaEvaluated).toBe(1);
    expect(result.breakdown.totalCriteriaAA).toBe(52);
  });
});
