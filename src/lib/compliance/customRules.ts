/**
 * RegLayer — Custom Compliance Rules engine
 *
 * WHY: Enterprise customers need organization-specific compliance policies beyond
 *      the built-in WCAG/EN 301 549 rule sets — e.g. "score must stay above 90",
 *      "color-contrast must always pass", "no more than 2 serious issues".
 * WHAT: A pure evaluator that runs workspace-defined rules over a scan's score +
 *       violations and returns pass/fail with human-readable expected/actual.
 * HOW: No DB access here (caller loads enabled rules), so it is trivially
 *      unit-testable. The DB row's JSON `config` is mapped via `toEvaluableRule`.
 *      Threshold semantics mirror the CI/CD GuardPolicy engine (src/lib/guard).
 */

export type CustomRuleType = "THRESHOLD" | "RULE_REQUIRED" | "IMPACT_BUDGET" | "CRITERION_REQUIRED";
export type RuleImpact = "critical" | "serious" | "moderate" | "minor";

/** Shape of the JSON `config` column, by rule type (only the relevant keys are set). */
export interface CustomRuleConfig {
  minScore?: number; // THRESHOLD
  axeRuleId?: string; // RULE_REQUIRED
  impact?: RuleImpact; // IMPACT_BUDGET
  maxCount?: number; // IMPACT_BUDGET
  criterion?: string; // CRITERION_REQUIRED
}

export interface EvaluableRule {
  id: string;
  name: string;
  type: CustomRuleType;
  severity: string;
  config: CustomRuleConfig;
}

export interface CustomRuleViolation {
  ruleId: string;
  impact: string;
  wcagCriteria?: string[];
}

export interface CustomRuleInput {
  score: number;
  violations: CustomRuleViolation[];
}

export interface CustomRuleResult {
  id: string;
  name: string;
  type: CustomRuleType;
  severity: string;
  passed: boolean;
  expected: string;
  actual: string;
  detail: string;
}

/** Map a Prisma row (with a JSON `config`) to a typed, evaluable rule. */
export function toEvaluableRule(row: {
  id: string;
  name: string;
  type: CustomRuleType;
  severity: string;
  config: unknown;
}): EvaluableRule {
  const config = (row.config && typeof row.config === "object" ? row.config : {}) as CustomRuleConfig;
  return { id: row.id, name: row.name, type: row.type, severity: row.severity, config };
}

/** Evaluate a single rule against a scan's score + violations. */
export function evaluateCustomRule(rule: EvaluableRule, input: CustomRuleInput): CustomRuleResult {
  const base = { id: rule.id, name: rule.name, type: rule.type, severity: rule.severity };

  switch (rule.type) {
    case "THRESHOLD": {
      const minScore = clampScore(rule.config.minScore);
      const passed = input.score >= minScore;
      return {
        ...base,
        passed,
        expected: `Score ≥ ${minScore}`,
        actual: `${Math.round(input.score)}`,
        detail: passed
          ? `Score ${Math.round(input.score)} meets the ${minScore} floor.`
          : `Score ${Math.round(input.score)} is below the ${minScore} floor.`,
      };
    }
    case "RULE_REQUIRED": {
      const axeRuleId = (rule.config.axeRuleId ?? "").trim();
      const count = axeRuleId ? input.violations.filter((v) => v.ruleId === axeRuleId).length : 0;
      const passed = !!axeRuleId && count === 0;
      return {
        ...base,
        passed,
        expected: axeRuleId ? `No "${axeRuleId}" violations` : "No rule configured",
        actual: `${count} found`,
        detail: !axeRuleId
          ? "Rule is misconfigured (no axe rule id)."
          : passed
            ? `"${axeRuleId}" passed on every page.`
            : `"${axeRuleId}" failed ${count} time(s).`,
      };
    }
    case "IMPACT_BUDGET": {
      const impact = rule.config.impact;
      const maxCount = Math.max(0, Math.floor(rule.config.maxCount ?? 0));
      const count = impact ? input.violations.filter((v) => v.impact === impact).length : 0;
      const passed = !!impact && count <= maxCount;
      return {
        ...base,
        passed,
        expected: impact ? `≤ ${maxCount} ${impact}` : "No impact configured",
        actual: `${count}`,
        detail: !impact
          ? "Rule is misconfigured (no impact level)."
          : passed
            ? `${count} ${impact} issue(s), within the budget of ${maxCount}.`
            : `${count} ${impact} issue(s) exceed the budget of ${maxCount}.`,
      };
    }
    case "CRITERION_REQUIRED": {
      const criterion = (rule.config.criterion ?? "").trim();
      const count = criterion
        ? input.violations.filter((v) => (v.wcagCriteria ?? []).includes(criterion)).length
        : 0;
      const passed = !!criterion && count === 0;
      return {
        ...base,
        passed,
        expected: criterion ? `WCAG ${criterion} must pass` : "No criterion configured",
        actual: `${count} violation(s)`,
        detail: !criterion
          ? "Rule is misconfigured (no WCAG criterion)."
          : passed
            ? `No violations mapped to WCAG ${criterion}.`
            : `${count} violation(s) mapped to WCAG ${criterion}.`,
      };
    }
    default:
      return {
        ...base,
        passed: false,
        expected: "—",
        actual: "—",
        detail: "Unknown rule type.",
      };
  }
}

/** Evaluate every (already enabled-filtered) rule. */
export function evaluateCustomRules(rules: EvaluableRule[], input: CustomRuleInput): CustomRuleResult[] {
  return rules.map((rule) => evaluateCustomRule(rule, input));
}

export function summarizeCustomRules(results: CustomRuleResult[]): {
  total: number;
  passed: number;
  failed: number;
  allPassed: boolean;
} {
  const passed = results.filter((r) => r.passed).length;
  return { total: results.length, passed, failed: results.length - passed, allPassed: passed === results.length };
}

function clampScore(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
