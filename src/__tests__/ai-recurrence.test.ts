/**
 * Issue recurrence diagnosis.
 *
 * "This recurred 4 times" is not actionable. The four common causes need four different
 * interventions, and recommending the wrong one wastes the fix — so the tests assert
 * that each cause is distinguished, not merely that recurrence is counted.
 */

import { describe, it, expect } from "vitest";
import {
  diagnoseRecurrence,
  findDurableFixPrecedents,
  rankComponentsByFailure,
  type ComponentFailureRecord,
  type FixPrecedent,
  type IssueEvent,
} from "@/lib/ai/graph/recurrence";

const DAY = 86_400_000;
const T0 = new Date("2026-01-01T00:00:00Z");
const at = (days: number) => new Date(T0.getTime() + days * DAY);

const detected = (days: number, page = "/checkout"): IssueEvent =>
  ({ type: "detected", at: at(days), page });
const fixed = (days: number, page = "/checkout"): IssueEvent =>
  ({ type: "fixed", at: at(days), page });

describe("distinguishing why an issue returns", () => {
  it("separates a persistent issue from a recurring one", () => {
    const diagnosis = diagnoseRecurrence([detected(0), detected(10), detected(20)]);

    // Never fixed means there is no evidence a fix would fail.
    expect(diagnosis.cause).toBe("never-fixed");
    expect(diagnosis.recommendedAction).toContain("Apply the fix");
  });

  it("detects a fix applied to one instance rather than the source", () => {
    const diagnosis = diagnoseRecurrence([
      detected(0, "/checkout"),
      fixed(5, "/checkout"),
      detected(20, "/account"),
    ]);

    expect(diagnosis.cause).toBe("fixed-at-instance");
    expect(diagnosis.recommendedAction).toContain("Fix the component, not the page");
  });

  it("detects a missing regression guard when it returns to the same surface", () => {
    const diagnosis = diagnoseRecurrence([
      detected(0, "/checkout"),
      fixed(5, "/checkout"),
      detected(60, "/checkout"),
    ]);

    expect(diagnosis.cause).toBe("no-regression-guard");
    // Fixing it a third time is the thing NOT to do.
    expect(diagnosis.recommendedAction.toLowerCase()).toContain("impossible");
  });

  it("detects a reverted fix from how fast it returned", () => {
    const diagnosis = diagnoseRecurrence([
      detected(0),
      fixed(5),
      detected(6),
    ]);

    // Two days is too fast to be drift; re-applying without finding the revert repeats
    // the cycle.
    expect(diagnosis.cause).toBe("fix-reverted");
    expect(diagnosis.recommendedAction).toContain("commit history");
  });

  it("detects adoption failure when it only appears on new pages", () => {
    const diagnosis = diagnoseRecurrence(
      [detected(0, "/checkout"), fixed(5, "/checkout"), detected(40, "/new-feature")],
      ["/new-feature"],
    );

    expect(diagnosis.cause).toBe("new-surface");
    // The fix held — adoption is the problem.
    expect(diagnosis.explanation).toContain("original fix held");
    expect(diagnosis.recommendedAction).toMatch(/lint rule|codemod/);
  });

  it("reports a fix that held", () => {
    const diagnosis = diagnoseRecurrence([detected(0), fixed(5)]);

    expect(diagnosis.cause).toBe("resolved");
    expect(diagnosis.recurrences).toBe(0);
  });

  it("prefers the revert explanation over a missing guard when both could apply", () => {
    // A same-page recurrence one day after a fix is a revert, not decay.
    const diagnosis = diagnoseRecurrence([fixed(5, "/a"), detected(6, "/a")]);
    expect(diagnosis.cause).toBe("fix-reverted");
  });

  it("does not blame instance-level fixing for a brand-new page", () => {
    // Appearing on a page that did not exist is not evidence the fix was misapplied.
    const diagnosis = diagnoseRecurrence(
      [fixed(0, "/a"), detected(40, "/brand-new")],
      ["/brand-new"],
    );
    expect(diagnosis.cause).toBe("new-surface");
  });
});

describe("diagnosis robustness", () => {
  it("is unaffected by event ordering", () => {
    const forward = diagnoseRecurrence([detected(0), fixed(5), detected(60)]);
    const shuffled = diagnoseRecurrence([detected(60), detected(0), fixed(5)]);

    // Diagnosis is entirely a function of sequence; an out-of-order event would
    // silently invert it.
    expect(shuffled.cause).toBe(forward.cause);
  });

  it("uses the most recent fix when several exist", () => {
    const diagnosis = diagnoseRecurrence([
      fixed(0), detected(10), fixed(20), detected(80),
    ]);

    expect(diagnosis.fixes).toBe(2);
    expect(diagnosis.recurrences).toBe(1);
  });

  it("reports how long the fix lasted", () => {
    expect(diagnoseRecurrence([fixed(0), detected(45)]).daysToRecurrence).toBe(45);
  });

  it("handles an empty history", () => {
    expect(diagnoseRecurrence([]).cause).toBe("never-fixed");
  });
});

describe("which component causes most failures", () => {
  const record = (overrides: Partial<ComponentFailureRecord>): ComponentFailureRecord => ({
    component: "X", issues: 1, detections: 1, pages: 1, owner: null, ...overrides,
  });

  it("ranks by distinct issues, not raw detections", () => {
    const ranked = rankComponentsByFailure([
      // One defect that happens to render on 200 pages — still one fix.
      record({ component: "Footer", issues: 1, detections: 200, pages: 200 }),
      // Nine separate defects — nine fixes.
      record({ component: "DataTable", issues: 9, detections: 20, pages: 2 }),
    ]);

    expect(ranked[0].component).toBe("DataTable");
  });

  it("breaks ties on reach", () => {
    const ranked = rankComponentsByFailure([
      record({ component: "A", issues: 2, pages: 3 }),
      record({ component: "B", issues: 2, pages: 30 }),
    ]);

    expect(ranked[0].component).toBe("B");
  });

  it("is deterministic", () => {
    const records = [record({ component: "B" }), record({ component: "A" })];
    expect(rankComponentsByFailure(records).map((r) => r.component))
      .toEqual(rankComponentsByFailure(records).map((r) => r.component));
  });
});

describe("which fixes solved similar issues", () => {
  const precedent = (overrides: Partial<FixPrecedent>): FixPrecedent => ({
    issueId: "i1", component: "IconButton", ruleId: "button-name", heldFor: 90,
    summary: "Added required label prop", ...overrides,
  });

  it("excludes precedents whose fix did not hold", () => {
    const found = findDurableFixPrecedents("button-name", [
      precedent({ issueId: "durable", heldFor: 120 }),
      precedent({ issueId: "failed", heldFor: 2 }),
    ]);

    // A precedent that already failed carries the authority of precedent while
    // repeating a known mistake — worse than suggesting nothing.
    expect(found.map((p) => p.issueId)).toEqual(["durable"]);
  });

  it("excludes fixes with unknown durability", () => {
    expect(findDurableFixPrecedents("button-name", [precedent({ heldFor: null })])).toEqual([]);
  });

  it("orders the longest-lasting fix first", () => {
    const found = findDurableFixPrecedents("button-name", [
      precedent({ issueId: "a", heldFor: 60 }),
      precedent({ issueId: "b", heldFor: 300 }),
    ]);

    expect(found[0].issueId).toBe("b");
  });

  it("only returns precedents for the same rule", () => {
    expect(findDurableFixPrecedents("image-alt", [precedent({ ruleId: "button-name" })]))
      .toEqual([]);
  });
});
