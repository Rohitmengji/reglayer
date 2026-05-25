/**
 * ---------------------------------------------------------
 * RegLayer — Policy Evaluator
 * ---------------------------------------------------------
 *
 * Purpose:
 * Evaluates scan results against defined compliance policies.
 *
 * Why this exists:
 * A scan finds issues. A policy evaluator determines
 * whether those issues constitute a compliance violation
 * under specific regulations.
 *
 * This separation is critical because:
 * - Same scan results may pass under one regulation
 *   but fail under another.
 * - Policy evaluation logic changes with regulations.
 * - Scanning logic changes with technology.
 *
 * Future Extensions:
 * - OPA (Open Policy Agent) integration
 * - Customer-specific policies
 * - Temporal compliance tracking
 * ---------------------------------------------------------
 */

import type {
  AccessibilityViolation,
  ComplianceReport,
  ComplianceRule,
  ComplianceRuleResult,
} from "@/lib/types";
import { WCAG_21_RULES } from "./rules/wcagRules";
import { EN_301_549_ALL_RULES } from "./rules/en301549Rules";

export type RegulationStandard = "WCAG 2.1" | "EN 301 549" | "EAA";

/**
 * Evaluate scan violations against WCAG 2.1 rules.
 */
export function evaluateCompliance(
  scanId: string,
  violations: AccessibilityViolation[],
  standard: RegulationStandard = "WCAG 2.1"
): ComplianceReport {
  const rules = standard === "WCAG 2.1" ? WCAG_21_RULES : EN_301_549_ALL_RULES;
  
  const ruleResults: ComplianceRuleResult[] = rules.map((rule) => {
    const matchingViolations = findViolationsForRule(rule, violations);
    return {
      rule,
      passed: matchingViolations.length === 0,
      violations: matchingViolations,
    };
  });

  const passedRules = ruleResults.filter((r) => r.passed).length;
  const totalRules = ruleResults.length;
  const overallCompliance = Math.round((passedRules / totalRules) * 100);

  return {
    scanId,
    timestamp: new Date().toISOString(),
    overallCompliance,
    ruleResults,
  };
}

/**
 * Match violations to a specific compliance rule.
 */
function findViolationsForRule(
  rule: ComplianceRule,
  violations: AccessibilityViolation[]
): AccessibilityViolation[] {
  return violations.filter((violation) =>
    violation.wcagTags.some((tag) => {
      const normalized = tag.replace(/[^0-9.]/g, "");
      return rule.wcagCriteria.some((criteria) => normalized.includes(criteria.replace(/\./g, "")));
    })
  );
}
