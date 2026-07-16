"use client";

/**
 * Follow-up suggestion engine — generates contextual follow-up chips
 * after each AI response.
 *
 * WHY: Users don't know what to ask next. ChatGPT shows suggestions;
 *      RegLayer should too. This is the #1 gap for AI-native feel.
 * WHAT: Analyzes the last assistant message and generates 3 relevant
 *       follow-up prompts the user can click.
 * HOW: Pattern-matching on response content + domain-specific suggestions.
 */

import { useMemo } from "react";
import type { ChatMessage } from "@/stores/chatStore";

interface FollowUp {
  text: string;
  icon: string;
}

const TOPIC_SUGGESTIONS: Record<string, FollowUp[]> = {
  contrast: [
    { icon: "🎨", text: "What contrast ratio do I need for AA?" },
    { icon: "🔧", text: "Generate a fix for this contrast issue" },
    { icon: "📊", text: "How many contrast violations does my site have?" },
  ],
  "alt text": [
    { icon: "🖼️", text: "Write alt text for my homepage images" },
    { icon: "📋", text: "When is alt=\"\" appropriate?" },
    { icon: "🔍", text: "Find all images missing alt text" },
  ],
  "aria": [
    { icon: "🏷️", text: "Explain aria-live regions" },
    { icon: "🔧", text: "Fix ARIA attribute misuse" },
    { icon: "📖", text: "ARIA roles cheat sheet" },
  ],
  "keyboard": [
    { icon: "⌨️", text: "How to fix keyboard trap issues?" },
    { icon: "🔧", text: "Add keyboard navigation to my component" },
    { icon: "📋", text: "Test keyboard accessibility checklist" },
  ],
  "wcag": [
    { icon: "📖", text: "Explain this WCAG criterion in detail" },
    { icon: "🎯", text: "What's the fastest path to WCAG AA?" },
    { icon: "⚖️", text: "How does this relate to legal compliance?" },
  ],
  "eaa": [
    { icon: "🇪🇺", text: "When does EAA enforcement start?" },
    { icon: "📋", text: "EAA vs WCAG differences" },
    { icon: "⚖️", text: "What are the penalties for non-compliance?" },
  ],
  "score": [
    { icon: "📈", text: "How can I improve my score fastest?" },
    { icon: "🔍", text: "What's dragging my score down?" },
    { icon: "🎯", text: "What score do I need for compliance?" },
  ],
  "fix": [
    { icon: "✅", text: "Verify this fix resolves the issue" },
    { icon: "🔄", text: "Re-scan after applying the fix" },
    { icon: "📋", text: "Are there similar issues on other pages?" },
  ],
};

const GENERIC_SUGGESTIONS: FollowUp[] = [
  { icon: "📊", text: "Summarize my current compliance status" },
  { icon: "🎯", text: "What should I fix first for maximum impact?" },
  { icon: "📖", text: "Explain WCAG 2.1 Level AA requirements" },
];

/**
 * Generates 3 follow-up suggestions based on the last assistant message.
 */
export function useFollowUpSuggestions(messages: ChatMessage[]): FollowUp[] {
  return useMemo(() => {
    if (messages.length === 0) return [];

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant || !lastAssistant.content || lastAssistant.content.length < 20) return [];

    const content = lastAssistant.content.toLowerCase();

    // Find matching topic
    for (const [topic, suggestions] of Object.entries(TOPIC_SUGGESTIONS)) {
      if (content.includes(topic)) {
        return suggestions.slice(0, 3);
      }
    }

    // Content-based heuristics
    if (content.includes("violation") || content.includes("issue") || content.includes("error")) {
      return [
        { icon: "🔧", text: "How do I fix this violation?" },
        { icon: "📊", text: "Show me all similar violations" },
        { icon: "⚖️", text: "What's the legal risk of ignoring this?" },
      ];
    }

    if (content.includes("scan") || content.includes("result")) {
      return [
        { icon: "📈", text: "How does this compare to my last scan?" },
        { icon: "🎯", text: "Prioritize violations by impact" },
        { icon: "📋", text: "Generate a remediation plan" },
      ];
    }

    return GENERIC_SUGGESTIONS;
  }, [messages]);
}
