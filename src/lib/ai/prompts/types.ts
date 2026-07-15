/**
 * RegLayer — Prompt Management Types
 *
 * WHY:  Prompts are the most frequently edited part of any AI system, yet
 *       they're usually hardcoded strings scattered across files. These types
 *       define the contract for a centralized, versionable prompt registry.
 *
 * HOW ANTHROPIC DOES IT:
 *   Claude's system prompts are versioned and tested. When they update a
 *   prompt, they A/B test it, measure quality metrics, and roll back if
 *   it degrades. We're building the foundation for the same workflow.
 */

/**
 * Unique identifier for a prompt template.
 * Each feature's prompt gets a kebab-case ID.
 */
export type PromptId =
  | "chat-system"
  | "chat-rag"
  | "violation-explainer"
  | "compliance-summary"
  | "visual-scan"
  | "manual-test-guidance"
  | "scan-insights"
  | "pr-review-fix"
  | "blog-editor"
  | "blog-generator"
  | "demand-letter-parser";

/**
 * A prompt template with variable placeholders.
 *
 * Variables use {{mustache}} syntax: "Explain {{violation.id}}"
 * The resolver replaces them at call time with actual values.
 */
export interface PromptTemplate {
  /** Unique identifier for this prompt. */
  id: PromptId;
  /** Human-readable name for dashboards. */
  name: string;
  /** What this prompt is used for. */
  description: string;
  /** The system prompt text with {{variable}} placeholders. */
  system: string;
  /**
   * Optional user message template.
   * Some prompts have a fixed user message structure (e.g., violation explainer
   * always sends the same fields). Others (like chat) don't — the user writes
   * the message.
   */
  userTemplate?: string;
  /** Version number — incremented when the prompt changes. */
  version: number;
  /** Which feature uses this prompt (for cost tracking correlation). */
  feature: string;
  /** Default temperature for this prompt. */
  defaultTemperature: number;
  /** Default max tokens for this prompt. */
  defaultMaxTokens: number;
}

/**
 * Variables passed to the resolver for template interpolation.
 * Keys are dot-notation paths: { "violation.id": "color-contrast" }
 */
export type PromptVariables = Record<string, string | number | undefined>;
