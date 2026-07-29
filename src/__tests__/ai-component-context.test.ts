/**
 * Component context and intervention selection.
 *
 * This decides the order a team works its accessibility backlog, so its failure mode is
 * wasted engineering effort rather than a crash. The assertions target the judgements
 * that change what gets done: repeat regressions, business tier, and reach.
 */

import { describe, it, expect } from "vitest";
import {
  buildRemediationOrder,
  chooseIntervention,
  hasSystemicRisk,
  prioritizeComponent,
  unroutedComponents,
  type ComponentContext,
} from "@/lib/ai/graph/component-context";

function component(overrides: Partial<ComponentContext> = {}): ComponentContext {
  return {
    component: "IconButton",
    designSystem: "core-ui",
    pagesUsing: 1,
    highestTier: "core",
    wcagCriteria: ["4.1.2"],
    worstImpact: "serious",
    historicalIssues: 1,
    previousFixes: 0,
    owner: "team-design-system",
    ...overrides,
  };
}

describe("repeat regressions change the recommendation", () => {
  it("flags a component whose fixes keep failing", () => {
    // Fixed twice, still producing issues — point fixes have been tried and did not hold.
    expect(hasSystemicRisk(component({ previousFixes: 2, historicalIssues: 4 }))).toBe(true);
  });

  it("does not flag a component fixed once that has not recurred", () => {
    // A success story must not be buried among genuine risks.
    expect(hasSystemicRisk(component({ previousFixes: 1, historicalIssues: 1 }))).toBe(false);
  });

  it("does not flag a component that has never been fixed", () => {
    expect(hasSystemicRisk(component({ previousFixes: 0, historicalIssues: 5 }))).toBe(false);
  });

  it("recommends making the defect impossible rather than fixing it again", () => {
    const priority = prioritizeComponent(
      component({ pagesUsing: 12, previousFixes: 3, historicalIssues: 6 }),
    );

    expect(priority.intervention).toBe("systemic");
    expect(priority.rationale).toContain("still regressing");
    expect(priority.rationale.toLowerCase()).toContain("impossible");
  });

  it("raises urgency for a repeatedly-regressing component", () => {
    const stable = prioritizeComponent(component({ pagesUsing: 10 }));
    const regressing = prioritizeComponent(
      component({ pagesUsing: 10, previousFixes: 3, historicalIssues: 6 }),
    );

    expect(regressing.score).toBeGreaterThan(stable.score);
  });
});

describe("intervention selection", () => {
  it("recommends a point fix for a single-page component", () => {
    expect(chooseIntervention(component({ pagesUsing: 1 }))).toBe("point-fix");
  });

  it("recommends a component fix when it is shared", () => {
    expect(chooseIntervention(component({ pagesUsing: 20 }))).toBe("component-fix");
  });

  it("reports leverage as the number of pages one fix resolves", () => {
    // This is the number that justifies the work to a product owner.
    expect(prioritizeComponent(component({ pagesUsing: 47 })).leverage).toBe(47);
  });
});

describe("business impact weighting", () => {
  it("ranks a revenue-path component above an identical marketing one", () => {
    const checkout = prioritizeComponent(component({ highestTier: "revenue" }));
    const blog = prioritizeComponent(component({ highestTier: "marketing" }));

    // A broken control in checkout blocks a purchase; the same control in a footer
    // does not.
    expect(checkout.score).toBeGreaterThan(blog.score);
  });

  it("lets a critical revenue issue outrank a broad but minor one", () => {
    const checkout = prioritizeComponent(
      component({ pagesUsing: 2, highestTier: "revenue", worstImpact: "critical" }),
    );
    const footer = prioritizeComponent(
      component({ pagesUsing: 300, highestTier: "marketing", worstImpact: "minor" }),
    );

    // Reach is damped precisely so breadth cannot drown out severity.
    expect(checkout.score).toBeGreaterThan(footer.score);
  });

  it("still gives reach real weight at equal severity", () => {
    const wide = prioritizeComponent(component({ pagesUsing: 100 }));
    const narrow = prioritizeComponent(component({ pagesUsing: 1 }));

    expect(wide.score).toBeGreaterThan(narrow.score);
  });
});

describe("ordering and routing", () => {
  it("orders the backlog by score", () => {
    const order = buildRemediationOrder([
      component({ component: "Footer", pagesUsing: 2, highestTier: "marketing", worstImpact: "minor" }),
      component({ component: "PayButton", pagesUsing: 4, highestTier: "revenue", worstImpact: "critical" }),
    ]);

    expect(order[0].component).toBe("PayButton");
  });

  it("prefers assignable work when scores tie", () => {
    const order = buildRemediationOrder([
      component({ component: "Orphan", owner: null }),
      component({ component: "Owned", owner: "team-a" }),
    ]);

    // Work nobody can be assigned stalls; surfacing it first makes a backlog look busy
    // while nothing moves.
    expect(order[0].component).toBe("Owned");
  });

  it("carries the owner through for routing", () => {
    expect(prioritizeComponent(component({ owner: "team-checkout" })).routeTo)
      .toBe("team-checkout");
  });

  it("surfaces components that cannot be routed", () => {
    const order = buildRemediationOrder([
      component({ component: "Orphan", owner: null }),
      component({ component: "Owned", owner: "team-a" }),
    ]);

    // Unknown ownership is itself an actionable finding.
    expect(unroutedComponents(order)).toEqual(["Orphan"]);
  });

  it("is deterministic for identical inputs", () => {
    const contexts = [component({ component: "B" }), component({ component: "A" })];
    expect(buildRemediationOrder(contexts).map((p) => p.component))
      .toEqual(buildRemediationOrder(contexts).map((p) => p.component));
  });

  it("handles an empty backlog", () => {
    expect(buildRemediationOrder([])).toEqual([]);
  });

  it("always explains its ranking", () => {
    const priority = prioritizeComponent(component({ pagesUsing: 12 }));
    expect(priority.rationale).toContain("12 pages");
    expect(priority.rationale).toContain("serious");
  });
});
