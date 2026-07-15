/**
 * RegLayer — RAG (Retrieval-Augmented Generation) Service
 *
 * WHY:  Without RAG, the chat gives generic WCAG advice. With RAG, it answers
 *       questions about YOUR actual violations, scans, and compliance status.
 *
 * HOW IT WORKS:
 *   1. User sends a message to the chat
 *   2. We embed the message and search for semantically similar violations
 *   3. If relevant violations are found, we inject them as context
 *   4. The LLM generates an answer grounded in real data with citations
 *   5. If no relevant violations found, falls back to general knowledge
 *
 * THIS IS THE EXACT PATTERN USED BY:
 *   - Perplexity: retrieve web pages → inject → answer with citations
 *   - Glean: retrieve internal docs → inject → answer enterprise questions
 *   - Harvey: retrieve case law → inject → generate legal analysis
 *   - Notion AI: retrieve workspace pages → answer in context
 *
 * ARCHITECTURE:
 *   The RAG service doesn't own the streaming or routing — it just builds
 *   the augmented message array. The chat route still calls stream() with
 *   the augmented messages. Separation of concerns.
 */

import "server-only";

import { searchViolations, type ViolationSearchResult } from "@/lib/ai/vector/search";
import { getPrompt } from "@/lib/ai/prompts/registry";
import { resolveTemplate } from "@/lib/ai/prompts/resolver";
import type { Message } from "@/lib/ai/gateway/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RAGContext {
  /** The violations retrieved as context. Empty if no relevant data found. */
  violations: ViolationSearchResult[];
  /** Whether RAG context was used (vs. falling back to general knowledge). */
  augmented: boolean;
  /** The augmented system prompt (with context injected). */
  systemPrompt: string;
}

// ── Core RAG Function ─────────────────────────────────────────────────────────

/**
 * Build RAG-augmented messages for the chat.
 *
 * Takes the user's latest message, retrieves relevant violations via
 * semantic search, and returns an augmented system prompt with context.
 * If no relevant violations are found, returns the standard chat prompt.
 *
 * @param userMessage - The latest user message (used as the search query)
 * @param options - Optional filters (scanId to scope to a specific scan)
 * @returns RAGContext with the system prompt to use
 */
export async function buildRAGContext(
  userMessage: string,
  options?: { scanId?: string },
): Promise<RAGContext> {
  // Fast path: skip RAG for short/generic messages that won't benefit from retrieval.
  // This eliminates ~1-2s of embed + vector search latency on greetings/generic questions.
  const trimmed = userMessage.trim().toLowerCase();
  if (trimmed.length < 15 || /^(hi|hello|hey|thanks|ok|yes|no|what can|how are|who are)\b/.test(trimmed)) {
    const standardPrompt = getPrompt("chat-system");
    return { violations: [], augmented: false, systemPrompt: standardPrompt.system };
  }

  // 1. Search for relevant violations
  let violations: ViolationSearchResult[] = [];

  try {
    violations = await searchViolations(userMessage, {
      limit: 5,
      minSimilarity: 0.6,
      scanId: options?.scanId,
    });
  } catch {
    // Vector search failed (maybe pgvector not enabled yet, or no embeddings)
    // Fall back gracefully to general knowledge
  }

  // 2. If no relevant violations found, use standard chat prompt
  if (violations.length === 0) {
    const standardPrompt = getPrompt("chat-system");
    return {
      violations: [],
      augmented: false,
      systemPrompt: standardPrompt.system,
    };
  }

  // 3. Deduplicate by ruleId (same violation from multiple scans wastes tokens)
  const seen = new Set<string>();
  const uniqueViolations = violations.filter((v) => {
    if (seen.has(v.ruleId)) return false;
    seen.add(v.ruleId);
    return true;
  });

  // 4. Build context string from retrieved violations
  const contextStr = uniqueViolations
    .map((v, i) => {
      return [
        `[${i + 1}] Rule: ${v.ruleId}`,
        `    Impact: ${v.impact}`,
        `    Description: ${v.description}`,
        `    Help: ${v.help}`,
        v.wcagCriteria ? `    WCAG: ${v.wcagCriteria}` : null,
        `    Similarity: ${(v.similarity * 100).toFixed(0)}%`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  // 4. Build augmented system prompt with context injected
  const ragTemplate = getPrompt("chat-rag");
  const augmentedSystem = resolveTemplate(ragTemplate.system, {
    context: contextStr,
  });

  return {
    violations,
    augmented: true,
    systemPrompt: augmentedSystem,
  };
}

/**
 * Build the full message array for a RAG-augmented chat request.
 *
 * @param conversationMessages - The full conversation history from the client
 * @param ragContext - The RAG context (from buildRAGContext)
 * @returns Message array ready to pass to gateway.stream()
 */
export function buildRAGMessages(
  conversationMessages: { role: "user" | "assistant"; content: string }[],
  ragContext: RAGContext,
): Message[] {
  return [
    { role: "system" as const, content: ragContext.systemPrompt },
    ...conversationMessages,
  ];
}
