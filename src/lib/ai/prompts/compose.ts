/**
 * RegLayer — System Prompt Composition
 *
 * Assembles the final system prompt from the base template plus every augmentation:
 * retrieved knowledge, user profile, remembered facts, and workspace decisions.
 *
 * WHY EXTRACTED: this was inline in the chat route, which meant the ordering and
 * escaping of four separately-sourced, partly user-controlled blocks could not be
 * tested. Retrieved context was wrapped in `<context>` with an explicit anti-injection
 * comment; `<user_profile>` and `<user_memory>` were concatenated with no escaping at
 * all, so the protection was inconsistent in a way nobody could see.
 *
 * ESCAPING STRATEGY — surgical, not blanket:
 * This product answers questions about HTML and ARIA, so retrieved context legitimately
 * contains `<div>`, `<button aria-label="…">` and similar. Stripping all angle brackets
 * would corrupt exactly the content users ask about. Instead only the ENVELOPE tags are
 * neutralised: `</context>` becomes inert text while `<div>` passes through untouched.
 * That removes the escape capability without degrading the answer.
 */

export type PromptSectionTag =
  | "context"
  | "scan_summary"
  | "user_profile"
  | "user_memory"
  | "workspace_decisions";

/**
 * Render a delimiter inert without touching legitimate markup.
 *
 * Matches only the specific envelope tag, so `</context>` is defused while any other
 * angle-bracketed content survives verbatim.
 */
export function neutralizeEnvelope(content: string, tag: PromptSectionTag): string {
  const envelope = new RegExp(`<\\s*/?\\s*${tag}\\s*>`, "gi");
  return content.replace(envelope, (match) => match.replace(/[<>]/g, ""));
}

/** Wrap untrusted content so the model treats it as data rather than instruction. */
export function wrapSection(tag: PromptSectionTag, content: string): string {
  return `<${tag}>\n${neutralizeEnvelope(content, tag)}\n</${tag}>`;
}

export interface ComposeSystemPromptInput {
  /** Base template from the prompt registry. Trusted. */
  base: string;
  /** Retrieved knowledge. Untrusted — may contain scan data authored by third parties. */
  retrievedContext?: string;
  /**
   * Authoritative counts for the caller's most recent scan, read from our own database.
   *
   * Kept separate from `retrievedContext` on purpose. Retrieval returns a relevance-
   * ranked sample, and a model asked "how many" will count whatever it can see; this
   * block is the only place totals may come from. It is still wrapped, because the URL
   * and rule ids inside it originate from scanned third-party pages.
   */
  scanSummary?: string;
  /** Formatted user profile. Untrusted — derived from user input. */
  userProfile?: string;
  /** Formatted memories. Untrusted — derived from user input. */
  userMemory?: string;
  /** Workspace decisions block. Untrusted — authored by workspace admins. */
  workspaceDecisions?: string;
}

export interface ComposedPrompt {
  system: string;
  /** Which augmentations were present, for lineage and analytics. */
  sections: PromptSectionTag[];
  /** True when retrieval contributed, selecting the RAG prompt variant upstream. */
  ragAugmented: boolean;
}

/**
 * Compose the final system prompt.
 *
 * ORDER IS DELIBERATE. Retrieved knowledge comes first because it is the evidence the
 * answer must be grounded in. Preferences and memory follow as modifiers on HOW to
 * answer. Workspace decisions come last because they are constraints that override
 * preference — being adjacent to the conversation gives them the strongest recency
 * position in the prompt.
 */
export function composeSystemPrompt(input: ComposeSystemPromptInput): ComposedPrompt {
  const sections: PromptSectionTag[] = [];
  const ragAugmented = Boolean(input.retrievedContext && input.retrievedContext.length > 0);

  // The base template owns a {{context}} placeholder when it is the RAG variant.
  let system = ragAugmented
    ? input.base.replace("{{context}}", wrapSection("context", input.retrievedContext!))
    : input.base;

  if (ragAugmented) sections.push("context");

  const append = (tag: PromptSectionTag, content?: string) => {
    if (!content) return;
    system += `\n\n${wrapSection(tag, content)}`;
    sections.push(tag);
  };

  append("scan_summary", input.scanSummary);
  append("user_profile", input.userProfile);
  append("user_memory", input.userMemory);
  append("workspace_decisions", input.workspaceDecisions);

  return { system, sections, ragAugmented };
}
