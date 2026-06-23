import { describe, it, expect } from "vitest";
import {
  evaluateCustomRule,
  evaluateCustomRules,
  summarizeCustomRules,
  toEvaluableRule,
  type EvaluableRule,
  type CustomRuleInput,
} from "@/lib/compliance/customRules";

const input: CustomRuleInput = {
  score: 82,
  violations: [
    { ruleId: "color-contrast", impact: "serious", wcagCriteria: ["1.4.3"] },
    { ruleId: "image-alt", impact: "critical", wcagCriteria: ["1.1.1"] },
    { ruleId: "label", impact: "critical", wcagCriteria: ["1.3.1", "3.3.2"] },
  ],
};

function rule(partial: Partial<EvaluableRule> & Pick<EvaluableRule, "type" | "config">): EvaluableRule {
  return { id: "r1", name: "Test", severity: "serious", ...partial };
}

describe("evaluateCustomRule — THRESHOLD", () => {
  it("passes when score meets the floor", () => {
    const r = evaluateCustomRule(rule({ type: "THRESHOLD", config: { minScore: 80 } }), input);
    expect(r.passed).toBe(true);
  });
  it("fails when score is below the floor", () => {
    const r = evaluateCustomRule(rule({ type: "THRESHOLD", config: { minScore: 90 } }), input);
    expect(r.passed).toBe(false);
    expect(r.actual).toBe("82");
  });
  it("clamps an out-of-range / missing minScore to 0 (passes)", () => {
    const r = evaluateCustomRule(rule({ type: "THRESHOLD", config: {} }), input);
    expect(r.passed).toBe(true);
  });
});

describe("evaluateCustomRule — RULE_REQUIRED", () => {
  it("fails when the required axe rule has violations", () => {
    const r = evaluateCustomRule(rule({ type: "RULE_REQUIRED", config: { axeRuleId: "color-contrast" } }), input);
    expect(r.passed).toBe(false);
    expect(r.actual).toBe("1 found");
  });
  it("passes when the axe rule has no violations", () => {
    const r = evaluateCustomRule(rule({ type: "RULE_REQUIRED", config: { axeRuleId: "link-name" } }), input);
    expect(r.passed).toBe(true);
  });
  it("is misconfigured (fails) when no axe rule id is set", () => {
    const r = evaluateCustomRule(rule({ type: "RULE_REQUIRED", config: {} }), input);
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/misconfigured/i);
  });
});

describe("evaluateCustomRule — IMPACT_BUDGET", () => {
  it("fails when the impact count exceeds the budget", () => {
    const r = evaluateCustomRule(rule({ type: "IMPACT_BUDGET", config: { impact: "critical", maxCount: 1 } }), input);
    expect(r.passed).toBe(false); // 2 critical > 1
  });
  it("passes when within budget", () => {
    const r = evaluateCustomRule(rule({ type: "IMPACT_BUDGET", config: { impact: "critical", maxCount: 2 } }), input);
    expect(r.passed).toBe(true);
  });
  it("passes for an impact with zero violations and a zero budget", () => {
    const r = evaluateCustomRule(rule({ type: "IMPACT_BUDGET", config: { impact: "minor", maxCount: 0 } }), input);
    expect(r.passed).toBe(true);
  });
});

describe("evaluateCustomRule — CRITERION_REQUIRED", () => {
  it("fails when a violation maps to the criterion", () => {
    const r = evaluateCustomRule(rule({ type: "CRITERION_REQUIRED", config: { criterion: "1.4.3" } }), input);
    expect(r.passed).toBe(false);
  });
  it("passes when no violation maps to the criterion", () => {
    const r = evaluateCustomRule(rule({ type: "CRITERION_REQUIRED", config: { criterion: "2.4.7" } }), input);
    expect(r.passed).toBe(true);
  });
});

describe("evaluateCustomRules + summarize", () => {
  it("evaluates many rules and summarizes pass/fail", () => {
    const rules: EvaluableRule[] = [
      rule({ id: "a", type: "THRESHOLD", config: { minScore: 80 } }), // pass
      rule({ id: "b", type: "IMPACT_BUDGET", config: { impact: "critical", maxCount: 0 } }), // fail
    ];
    const results = evaluateCustomRules(rules, input);
    const summary = summarizeCustomRules(results);
    expect(summary.total).toBe(2);
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.allPassed).toBe(false);
  });

  it("reports allPassed for an empty rule set", () => {
    expect(summarizeCustomRules([]).allPassed).toBe(true);
  });
});

describe("toEvaluableRule", () => {
  it("coerces a non-object JSON config to {}", () => {
    const r = toEvaluableRule({ id: "x", name: "n", type: "THRESHOLD", severity: "minor", config: null });
    expect(r.config).toEqual({});
  });
});
