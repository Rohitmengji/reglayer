/**
 * LLM Provider Interface — swap GPT ↔ Claude via config.
 * Adding a new provider = new file + set LLM_PROVIDER env var.
 */

/** A single file edit returned by the LLM. */
export interface Edit {
  path: string;
  action: "edit" | "create";
  search?: string;
  replace?: string;
  content?: string;
}

/** Token usage and cost from a single LLM call. */
export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
}

/** What the LLM returns after analyzing a task. */
export interface LLMResult {
  summary: string;
  edits: Edit[];
  usage: LLMUsage;
}

/** File context sent to the LLM. */
export interface FileContext {
  path: string;
  content: string;
}

/** Every LLM provider implements this. */
export interface LLMProvider {
  name: string;
  generateEdits(task: string, files: FileContext[]): Promise<LLMResult>;
}
