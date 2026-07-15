/**
 * RegLayer — Prompt Variable Resolver
 *
 * WHY:  Prompts contain variables like {{violation.id}} that must be replaced
 *       with actual values at call time. This is the same pattern as Handlebars,
 *       Mustache, or Jinja2 — but intentionally minimal (no logic, no loops).
 *
 * DESIGN: Pure function, no side effects, easy to test.
 *   - Replaces {{key}} with the corresponding value from variables
 *   - Missing variables are replaced with empty string (safe default)
 *   - No nested templates or conditional logic (YAGNI)
 */

import type { PromptVariables } from "./types";

/**
 * Resolve {{variable}} placeholders in a template string.
 *
 * @example
 * resolve("Explain {{violation.id}} ({{violation.impact}})", {
 *   "violation.id": "color-contrast",
 *   "violation.impact": "serious",
 * })
 * // → "Explain color-contrast (serious)"
 */
export function resolveTemplate(
  template: string,
  variables: PromptVariables,
): string {
  return template.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (_, key: string) => {
    const trimmedKey = key.trim();
    const value = variables[trimmedKey];
    return value !== undefined ? String(value) : "";
  });
}
