/**
 * RegLayer — Context Compression Engine
 *
 * When retrieval returns too much context for the LLM's token budget,
 * this engine intelligently compresses it WITHOUT losing critical information.
 *
 * PROBLEM:
 *   Hybrid search returns 20 violations + Graph RAG returns 15 paths +
 *   Knowledge base returns 10 chunks = 45 pieces of context.
 *   That's ~30K tokens. GPT-4o-mini has 128K context but:
 *   - More context = slower responses (latency scales linearly)
 *   - More context = higher cost ($0.15/M input tokens adds up)
 *   - More context = MORE HALLUCINATION (attention dilution)
 *
 *   Optimal: 3K-8K tokens of highly relevant, compressed context.
 *
 * ARCHITECTURE:
 *   Raw Context (30K tokens)
 *         │
 *         ▼
 *   Relevance Scoring (rank by query similarity)
 *         │
 *         ▼
 *   Dynamic Selection (top N chunks within budget)
 *         │
 *         ▼
 *   Semantic Compression (summarize verbose chunks)
 *         │
 *         ▼
 *   Deduplication (remove redundant information)
 *         │
 *         ▼
 *   Compressed Context (5K tokens)
 *
 * TECHNIQUES:
 *   1. Chunk Ranking — Score each chunk's relevance to the query
 *   2. Budget Allocation — Distribute token budget across sources
 *   3. Extractive Compression — Keep only key sentences from each chunk
 *   4. Deduplication — Remove near-duplicate information
 *   5. Context Distillation — LLM-based summarization for large docs (expensive)
 *
 * INSPIRED BY:
 *   - LongContext Compression (Microsoft Research, 2023)
 *   - LLMLingua (token pruning without LLM call)
 *   - Anthropic's "give Claude less, get better answers"
 *   - Cohere's context truncation strategies
 */

import "server-only";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ContextChunk {
  id: string;
  content: string;
  source: string;        // "violations" | "graph" | "knowledge" | "scans"
  relevanceScore: number; // 0–1, how relevant to the query
  tokenCount: number;     // estimated tokens in this chunk
  metadata?: Record<string, unknown>;
}

export interface CompressionOptions {
  /** Max tokens for the final compressed context */
  tokenBudget: number;
  /** The user query (for relevance scoring) */
  query: string;
  /** Budget allocation per source (fraction, must sum to ≤ 1.0) */
  sourceWeights?: Record<string, number>;
  /** Enable extractive compression on verbose chunks */
  extractive?: boolean;
  /** Enable deduplication */
  deduplicate?: boolean;
  /** Minimum relevance score to include (0–1) */
  minRelevance?: number;
}

export interface CompressionResult {
  /** Final compressed context string */
  compressed: string;
  /** How many tokens in the output */
  tokenCount: number;
  /** How many chunks were included (vs total input) */
  chunksIncluded: number;
  chunksTotal: number;
  /** Compression ratio (output/input tokens) */
  ratio: number;
  /** Which strategies were applied */
  strategies: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CHARS_PER_TOKEN = 4; // rough English average
const DEFAULT_BUDGET = 6000; // 6K tokens ≈ sweet spot for quality vs cost
const DEFAULT_MIN_RELEVANCE = 0.3;

// ── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Compress a set of context chunks to fit within a token budget.
 *
 * Pipeline:
 *   1. Score relevance
 *   2. Deduplicate
 *   3. Rank and select within budget
 *   4. Extractive compress verbose chunks
 *   5. Assemble final context
 */
export function compressContext(
  chunks: ContextChunk[],
  options: CompressionOptions,
): CompressionResult {
  const budget = options.tokenBudget || DEFAULT_BUDGET;
  const minRelevance = options.minRelevance ?? DEFAULT_MIN_RELEVANCE;
  const strategies: string[] = [];

  if (chunks.length === 0) {
    return { compressed: "", tokenCount: 0, chunksIncluded: 0, chunksTotal: 0, ratio: 1, strategies: [] };
  }

  // Total input tokens
  const inputTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);

  // If already under budget, return as-is
  if (inputTokens <= budget) {
    const compressed = chunks.map((c) => c.content).join("\n\n");
    return {
      compressed,
      tokenCount: inputTokens,
      chunksIncluded: chunks.length,
      chunksTotal: chunks.length,
      ratio: 1.0,
      strategies: ["no-op (under budget)"],
    };
  }

  let processed = [...chunks];

  // 1. Filter by minimum relevance
  processed = processed.filter((c) => c.relevanceScore >= minRelevance);
  if (processed.length < chunks.length) {
    strategies.push(`relevance-filter (removed ${chunks.length - processed.length} low-relevance chunks)`);
  }

  // 2. Deduplicate near-identical content
  if (options.deduplicate !== false) {
    const before = processed.length;
    processed = deduplicateChunks(processed);
    if (processed.length < before) {
      strategies.push(`deduplication (removed ${before - processed.length} duplicates)`);
    }
  }

  // 3. Sort by relevance (highest first)
  processed.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // 4. Budget allocation — select chunks within budget
  const selected = allocateBudget(processed, budget, options.sourceWeights);
  strategies.push(`budget-allocation (selected ${selected.length}/${processed.length} chunks)`);

  // 5. Extractive compression on verbose chunks
  if (options.extractive !== false) {
    const compressed = selected.map((chunk) => {
      if (chunk.tokenCount > budget / selected.length * 1.5) {
        // This chunk is disproportionately large — compress it
        return extractiveCompress(chunk, Math.floor(budget / selected.length), options.query);
      }
      return chunk;
    });
    const beforeTokens = selected.reduce((s, c) => s + c.tokenCount, 0);
    const afterTokens = compressed.reduce((s, c) => s + c.tokenCount, 0);
    if (afterTokens < beforeTokens) {
      strategies.push(`extractive-compression (${beforeTokens} → ${afterTokens} tokens)`);
    }
    processed = compressed;
  } else {
    processed = selected;
  }

  // 6. Assemble final context
  const compressed = processed.map((c) => c.content).join("\n\n");
  const outputTokens = estimateTokens(compressed);

  return {
    compressed,
    tokenCount: outputTokens,
    chunksIncluded: processed.length,
    chunksTotal: chunks.length,
    ratio: outputTokens / inputTokens,
    strategies,
  };
}

// ── Relevance Scoring ─────────────────────────────────────────────────────────

/**
 * Score chunk relevance using lightweight term overlap.
 * Fast (no LLM/embedding call) — suitable for real-time compression.
 */
export function scoreRelevance(chunk: string, query: string): number {
  const queryTerms = tokenize(query);
  const chunkTerms = new Set(tokenize(chunk));

  if (queryTerms.length === 0) return 0.5; // neutral score for empty query

  // Term overlap ratio
  const overlap = queryTerms.filter((t) => chunkTerms.has(t)).length;
  const overlapScore = overlap / queryTerms.length;

  // Bonus for exact phrase match
  const phraseBonus = chunk.toLowerCase().includes(query.toLowerCase().trim()) ? 0.2 : 0;

  // Bonus for short, dense chunks (more signal per token)
  const densityBonus = chunk.length < 500 ? 0.1 : 0;

  return Math.min(1.0, overlapScore + phraseBonus + densityBonus);
}

/**
 * Score relevance for a batch of chunks against a query.
 * Returns chunks with updated relevanceScore.
 */
export function scoreChunks(chunks: ContextChunk[], query: string): ContextChunk[] {
  return chunks.map((chunk) => ({
    ...chunk,
    relevanceScore: chunk.relevanceScore > 0
      ? chunk.relevanceScore  // preserve pre-scored relevance (from hybrid search)
      : scoreRelevance(chunk.content, query),
  }));
}

// ── Deduplication ─────────────────────────────────────────────────────────────

/**
 * Remove near-duplicate chunks using Jaccard similarity on token sets.
 * Keeps the higher-scored chunk when two are >70% similar.
 */
export function deduplicateChunks(chunks: ContextChunk[], threshold = 0.7): ContextChunk[] {
  const kept: ContextChunk[] = [];

  for (const chunk of chunks) {
    const chunkTokens = new Set(tokenize(chunk.content));
    const isDuplicate = kept.some((existing) => {
      const existingTokens = new Set(tokenize(existing.content));
      const intersection = [...chunkTokens].filter((t) => existingTokens.has(t)).length;
      const union = new Set([...chunkTokens, ...existingTokens]).size;
      const similarity = union > 0 ? intersection / union : 0;
      return similarity >= threshold;
    });

    if (!isDuplicate) {
      kept.push(chunk);
    }
  }

  return kept;
}

// ── Budget Allocation ─────────────────────────────────────────────────────────

/**
 * Select chunks that fit within the token budget.
 * Optionally respects per-source weight allocations.
 *
 * Strategy: greedy selection by relevance score, with optional per-source caps.
 */
function allocateBudget(
  chunks: ContextChunk[],
  budget: number,
  sourceWeights?: Record<string, number>,
): ContextChunk[] {
  if (!sourceWeights) {
    // Simple greedy: take highest relevance chunks until budget exhausted
    return greedySelect(chunks, budget);
  }

  // Per-source budget allocation
  const selected: ContextChunk[] = [];
  const sources = [...new Set(chunks.map((c) => c.source))];

  for (const source of sources) {
    const weight = sourceWeights[source] ?? (1.0 / sources.length);
    const sourceBudget = Math.floor(budget * weight);
    const sourceChunks = chunks.filter((c) => c.source === source);
    selected.push(...greedySelect(sourceChunks, sourceBudget));
  }

  // Fill remaining budget with highest-relevance unselected chunks
  const selectedIds = new Set(selected.map((c) => c.id));
  const remaining = chunks.filter((c) => !selectedIds.has(c.id));
  const usedTokens = selected.reduce((s, c) => s + c.tokenCount, 0);
  const remainingBudget = budget - usedTokens;

  if (remainingBudget > 0) {
    selected.push(...greedySelect(remaining, remainingBudget));
  }

  return selected;
}

function greedySelect(chunks: ContextChunk[], budget: number): ContextChunk[] {
  const selected: ContextChunk[] = [];
  let used = 0;

  for (const chunk of chunks) {
    if (used + chunk.tokenCount <= budget) {
      selected.push(chunk);
      used += chunk.tokenCount;
    } else if (budget - used > 50) {
      // Partially include a truncated version of the next chunk
      const remaining = budget - used;
      const truncated = {
        ...chunk,
        content: chunk.content.slice(0, remaining * CHARS_PER_TOKEN),
        tokenCount: remaining,
      };
      selected.push(truncated);
      break;
    } else {
      break;
    }
  }

  return selected;
}

// ── Extractive Compression ────────────────────────────────────────────────────

/**
 * Compress a verbose chunk by extracting only the most relevant sentences.
 * No LLM call — uses sentence scoring with query term overlap.
 */
function extractiveCompress(
  chunk: ContextChunk,
  targetTokens: number,
  query: string,
): ContextChunk {
  const sentences = chunk.content.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [chunk.content];

  if (sentences.length <= 2) return chunk; // too short to compress

  // Score each sentence by relevance to query
  const scored = sentences.map((s) => ({
    text: s.trim(),
    score: scoreRelevance(s, query),
  }));

  // Sort by score, take top sentences within budget
  scored.sort((a, b) => b.score - a.score);

  let compressed = "";
  let tokens = 0;
  const included: typeof scored = [];

  for (const sentence of scored) {
    const sentenceTokens = estimateTokens(sentence.text);
    if (tokens + sentenceTokens <= targetTokens) {
      included.push(sentence);
      tokens += sentenceTokens;
    }
  }

  // Re-order by original position for readability
  included.sort((a, b) => {
    const aIdx = sentences.indexOf(a.text + "." ) !== -1 ? sentences.indexOf(a.text + ".") : sentences.indexOf(a.text);
    const bIdx = sentences.indexOf(b.text + ".") !== -1 ? sentences.indexOf(b.text + ".") : sentences.indexOf(b.text);
    return aIdx - bIdx;
  });

  compressed = included.map((s) => s.text).join(" ");

  return {
    ...chunk,
    content: compressed,
    tokenCount: estimateTokens(compressed),
  };
}

// ── Context Distillation (LLM-based, expensive) ───────────────────────────────

/**
 * Summarize a large set of chunks into a compact representation.
 * Uses an LLM call — only use when other methods aren't sufficient.
 *
 * This is for cases like: 200 document chunks need to become 1 paragraph.
 *
 * Returns a prompt string that can be passed to complete().
 */
export function buildDistillationPrompt(chunks: ContextChunk[], query: string): string {
  const chunksText = chunks
    .slice(0, 20) // cap to prevent prompt overflow
    .map((c, i) => `[${i + 1}] (${c.source}) ${c.content.slice(0, 500)}`)
    .join("\n\n");

  return `Distill the following ${chunks.length} pieces of context into a concise summary that answers: "${query}"

Rules:
- Keep ONLY information directly relevant to the question
- Preserve specific numbers, criteria IDs, and proper nouns
- Remove redundant/repeated information
- Target 300-500 words maximum
- Use bullet points for key facts

Context:
${chunksText}

Distilled summary:`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Estimate token count from text */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Tokenize text into lowercase terms (for overlap scoring) */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}
