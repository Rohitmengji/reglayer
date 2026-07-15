/**
 * RegLayer — Prompt Registry
 *
 * WHY:  The single source of truth for all LLM prompts. Features call
 *       getPrompt("violation-explainer") instead of hardcoding strings.
 *
 * WHAT IT DOES:
 *   1. getPrompt(id) → returns the PromptTemplate
 *   2. buildMessages(id, variables) → returns ready-to-send Message[]
 *      with system + user messages, variables resolved
 *
 * HOW IT CONNECTS TO THE GATEWAY:
 *   Before:  complete({ messages: [{ role: "system", content: "..." }, ...] })
 *   After:   complete({ messages: buildMessages("violation-explainer", vars) })
 *
 *   The feature code no longer contains any prompt text — just a prompt ID
 *   and the variables to fill in.
 */

import type { PromptId, PromptTemplate, PromptVariables } from "./types";
import type { Message } from "../gateway/types";
import { PROMPT_TEMPLATES } from "./templates";
import { resolveTemplate } from "./resolver";

// ── Registry ──────────────────────────────────────────────────────────────────

const promptMap = new Map<PromptId, PromptTemplate>(
  PROMPT_TEMPLATES.map((t) => [t.id, t]),
);

/**
 * Get a prompt template by ID.
 * Throws if the ID isn't registered — this is a developer error.
 */
export function getPrompt(id: PromptId): PromptTemplate {
  const template = promptMap.get(id);
  if (!template) {
    throw new Error(`Unknown prompt: "${id}". Check the prompt registry.`);
  }
  return template;
}

/**
 * Get all registered prompt templates.
 * Useful for a future prompt management dashboard.
 */
export function getAllPrompts(): PromptTemplate[] {
  return PROMPT_TEMPLATES;
}

/**
 * Build ready-to-send messages from a prompt template + variables.
 *
 * Returns a Message[] with the system prompt and (if the template has a
 * userTemplate) a resolved user message. If there's no userTemplate,
 * only the system message is returned — the caller adds their own user message.
 *
 * @example
 * // With user template (violation explainer):
 * const messages = buildMessages("violation-explainer", {
 *   "violation.id": "color-contrast",
 *   "violation.impact": "serious",
 * });
 * // → [{ role: "system", content: "..." }, { role: "user", content: "Explain..." }]
 *
 * // Without user template (chat):
 * const messages = buildMessages("chat-system");
 * // → [{ role: "system", content: "You are RegLayer AI..." }]
 * // Caller then appends their own user messages
 */
export function buildMessages(
  id: PromptId,
  variables?: PromptVariables,
): Message[] {
  const template = getPrompt(id);
  const messages: Message[] = [
    { role: "system", content: template.system },
  ];

  if (template.userTemplate && variables) {
    messages.push({
      role: "user",
      content: resolveTemplate(template.userTemplate, variables),
    });
  }

  return messages;
}
