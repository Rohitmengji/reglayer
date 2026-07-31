/**
 * Tests for the Autonomous Accessibility Agent PURE planner — triage/routing,
 * autonomy-driven stage selection, and the safety guardrails (risky categories
 * never auto-applied; review categories force a human gate).
 */
import { describe, it, expect } from "vitest";

import {
  planRemediation,
  routeViolation,
  type AgentStage,
} from "@/lib/agents/remediation/planner";

const stage = (plan: ReturnType<typeof planRemediation>, s: AgentStage) =>
  plan.stages.find((x) => x.stage === s)!;

describe("Autonomous Accessibility Agent — planner", () => {
  describe("routeViolation", () => {
    it("routes a safe, unambiguous rule as auto-applicable", () => {
      const r = routeViolation({ ruleId: "html-has-lang", impact: "serious" });
      expect(r.autoApplicable).toBe(true);
      expect(r.needsReview).toBe(false);
      expect(r.risky).toBe(false);
      expect(r.needsDeveloper).toBe(false);
    });

    it("routes alt-text as needs-review (markup auto, value human)", () => {
      const r = routeViolation({ ruleId: "image-alt", impact: "critical" });
      expect(r.needsReview).toBe(true);
      expect(r.autoApplicable).toBe(false); // never auto-applied — value needs a human
    });

    it("routes contrast as risky and never auto-applicable", () => {
      const r = routeViolation({ ruleId: "color-contrast", impact: "serious" });
      expect(r.risky).toBe(true);
      expect(r.autoApplicable).toBe(false);
    });

    it("routes an unknown rule to a developer", () => {
      const r = routeViolation({ ruleId: "some-custom-rule", impact: "minor" });
      expect(r.needsDeveloper).toBe(true);
      expect(r.category).toBeNull();
    });
  });

  describe("planRemediation — guardrails", () => {
    const violations = [
      { ruleId: "html-has-lang", impact: "serious" }, // auto
      { ruleId: "region", impact: "moderate" }, // auto (landmarks)
      { ruleId: "image-alt", impact: "critical" }, // needs review
      { ruleId: "color-contrast", impact: "serious" }, // risky
      { ruleId: "custom-thing", impact: "minor" }, // developer
    ];

    it("counts each lane correctly", () => {
      const plan = planRemediation(violations, "autonomous");
      expect(plan.counts.total).toBe(5);
      expect(plan.counts.autoApplicable).toBe(2);
      expect(plan.counts.needsReview).toBe(1);
      expect(plan.counts.risky).toBe(1);
      expect(plan.counts.needsDeveloper).toBe(1);
      expect(plan.autoApplyRuleIds.sort()).toEqual(["html-has-lang", "region"]);
    });

    it("never lists risky or review rules as auto-applicable", () => {
      const plan = planRemediation(violations, "autonomous");
      expect(plan.autoApplyRuleIds).not.toContain("color-contrast");
      expect(plan.autoApplyRuleIds).not.toContain("image-alt");
    });

    it("forces an approval gate when review/risky work is present, even autonomously", () => {
      const plan = planRemediation(violations, "autonomous");
      expect(plan.requiresApproval).toBe(true);
      expect(stage(plan, "review_gate").willRun).toBe(true);
    });

    it("autonomous run with only safe fixes needs no approval", () => {
      const plan = planRemediation(
        [
          { ruleId: "html-has-lang", impact: "serious" },
          { ruleId: "region", impact: "moderate" },
        ],
        "autonomous",
      );
      expect(plan.requiresApproval).toBe(false);
      expect(stage(plan, "review_gate").willRun).toBe(false);
      expect(stage(plan, "prove").willRun).toBe(true);
    });

    it("assisted run always requires approval before changes", () => {
      const plan = planRemediation([{ ruleId: "html-has-lang", impact: "serious" }], "assisted");
      expect(plan.requiresApproval).toBe(true);
    });
  });

  describe("planRemediation — autonomy levels", () => {
    const violations = [{ ruleId: "html-has-lang", impact: "serious" }];

    it("suggest mode runs only read-only stages, no side effects", () => {
      const plan = planRemediation(violations, "suggest");
      expect(plan.requiresApproval).toBe(false);
      expect(stage(plan, "understand").willRun).toBe(true);
      expect(stage(plan, "locate").willRun).toBe(true);
      expect(stage(plan, "propose").willRun).toBe(true);
      expect(stage(plan, "open_pr").willRun).toBe(false);
      expect(stage(plan, "verify").willRun).toBe(false);
      expect(stage(plan, "close_issue").willRun).toBe(false);
      expect(stage(plan, "prove").willRun).toBe(false);
    });

    it("read-only stages never require approval", () => {
      const plan = planRemediation(violations, "autonomous");
      expect(stage(plan, "understand").requiresApproval).toBe(false);
      expect(stage(plan, "locate").requiresApproval).toBe(false);
      expect(stage(plan, "propose").requiresApproval).toBe(false);
    });

    it("handles an empty scan gracefully", () => {
      const plan = planRemediation([], "autonomous");
      expect(plan.counts.total).toBe(0);
      expect(plan.summary).toContain("No violations");
    });
  });
});
