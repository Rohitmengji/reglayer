/**
 * RegLayer — Retrieval Pipeline Optimizer
 *
 * Unified orchestrator that chains every retrieval component into a single
 * optimized pipeline. Instead of the chat route manually calling 6 modules
 * in sequence, this provides one function: `optimizedRetrieve()`.
 *
 * BEFORE (manual wiring in every route):
 *   rewriteQuery → hybridSearch → buildGraphContext → searchKnowledge →
 *   compressContext → cacheLookup → ...
 *
 * AFTER (single call):
 *   optimizedRetrieve(query, options) → ready-to-inject LLM context
 *
 * FULL PIPELINE:
 *   ┌──────────────┐
 *   │   Query      │
 *   └──────┬───────┘
 *          ▼
 *   ┌──────────────┐     hit
 *   │ Cache Check  │──────────→ Return cached (Layer 1-2)
 *   └──────┬───────┘
 *          │ miss
 *          ▼
 *   ┌──────────────┐
 *   │ Intent +     │  Classify → plan data sources
 *   │ Plan         │
 *   └──────┬───────┘
 *          ▼
 *   ┌──────────────┐
 *   │ Rewrite +    │  Expand synonyms, generate multi-queries
 *   │ Expand       │
 *   └──────┬───────┘
 *          ▼
 *   ┌──────────────────────────────────────┐
 *   │ Parallel Retrieval                   │
 *   │ ┌────────┐ ┌────────┐ ┌────────┐   │
 *   │ │ Hybrid │ │ Graph  │ │ Know-  │   │
 *   │ │ Search │ │  RAG   │ │ ledge  │   │
 *   │ └───┬────┘ └───┬────┘ └───┬────┘   │
 *   └─────┼──────────┼──────────┼─────────┘
 *         └──────────┼──────────┘
 *                    ▼
 *   ┌──────────────────┐
 *   │ Merge + Dedup    │  Combine results, remove duplicates
 *   └──────┬───────────┘
 *          ▼
 *   ┌──────────────────┐
 *   │ Rerank           │  LLM cross-encoder (optional)
 *   └──────┬───────────┘
 *          ▼
 *   ┌──────────────────┐
 *   │ Compress         │  Budget allocation, extractive compression
 *   └──────┬───────────┘
 *          ▼
 *   ┌──────────────────┐
 *   │ Cache Store      │  Store for future hits
 *   └──────┬───────────┘
 *          ▼
 *   ┌──────────────────┐
 *   │ Ready Context    │  Formatted for LLM injection
 *   └──────────────────┘
 *
 * INSPIRED BY:
 *   - Perplexity's retrieval pipeline (multi-source, rerank, synthesize)
 *   - Cohere RAG pipeline (query → retrieve → rerank → generate)
 *   - LlamaIndex's query pipeline (composable retrieval stages)
 *   - Haystack's pipeline abstraction (modular retrieval DAG)
 */

import "server-only";

import { hybridSearch, multiQuerySearch, type HybridSearchResult } from "@/lib/ai/search/hybrid";
import { buildGraphContext, type GraphSearchResult } from "@/lib/ai/graph/service";
import { searchKnowledge, type KnowledgeSearchResult } from "@/lib/ai/knowledge/service";
import { compressContext, scoreRelevance, estimateTokens, type ContextChunk } from "@/lib/ai/compression/engine";
import { cacheLookup, cacheStore, embeddingLookup, embeddingStore, type CacheLookupResult } from "@/lib/ai/cache/context-cache";
import { classifyIntent, type QueryIntent } from "@/lib/ai/planner/engine";
import { embed } from "@/lib/ai/gateway";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RetrievalConfig {
  /** Token budget for the final context */
  tokenBudget?: number;
  /** Enable multi-query retrieval (costs 1 extra LLM call) */
  multiQuery?: boolean;
  /** Enable LLM reranking (costs 1 extra LLM call) */
  rerank?: boolean;
  /** Enable graph RAG traversal */
  graph?: boolean;
  /** Enable knowledge base search */
  knowledge?: boolean;
  /** Enable caching */
  cache?: boolean;
  /** Scope to a specific scan */
  scanId?: string;
  /** Workspace for tenant isolation */
  workspaceId?: string;
  /** User for cache scoping */
  userId?: string;
}

export interface RetrievalResult {
  /** Final compressed context ready for LLM injection */
  context: string;
  /** Total tokens in the context */
  tokenCount: number;
  /** Whether this was a cache hit */
  cached: boolean;
  /** Which cache layer hit (if cached) */
  cacheLayer?: string;
  /** The detected query intent */
  intent: QueryIntent;
  /** Pipeline stages that ran and their latencies */
  stages: PipelineStage[];
  /** Total pipeline latency in ms */
  totalLatencyMs: number;
  /** Number of sources that contributed context */
  sourceCount: number;
}

export interface PipelineStage {
  name: string;
  latencyMs: number;
  resultCount: number;
  skipped: boolean;
  reason?: string;
}

// ── Pipeline Presets ──────────────────────────────────────────────────────────

/** Fast preset: cache + hybrid search, no LLM calls in retrieval */
export const FAST_PRESET: RetrievalConfig = {
  tokenBudget: 4000,
  multiQuery: false,
  rerank: false,
  graph: false,
  knowledge: false,
  cache: true,
};

/** Balanced preset: cache + hybrid + graph, optional rerank */
export const BALANCED_PRESET: RetrievalConfig = {
  tokenBudget: 6000,
  multiQuery: false,
  rerank: false,
  graph: true,
  knowledge: true,
  cache: true,
};

/** Thorough preset: all sources, multi-query, reranking */
export const THOROUGH_PRESET: RetrievalConfig = {
  tokenBudget: 8000,
  multiQuery: true,
  rerank: true,
  graph: true,
  knowledge: true,
  cache: true,
};

/**
 * Auto-select preset based on query intent.
 * Simple lookups get the fast pipeline, complex questions get thorough.
 */
export function autoPreset(intent: QueryIntent): RetrievalConfig {
  switch (intent) {
    case "conversational": return FAST_PRESET;
    case "lookup": return FAST_PRESET;
    case "comparison": return BALANCED_PRESET;
    case "analysis": return THOROUGH_PRESET;
    case "multi_step": return THOROUGH_PRESET;
    default: return BALANCED_PRESET;
  }
}

// ── Main Pipeline ─────────────────────────────────────────────────────────────

/**
 * Execute the full optimized retrieval pipeline.
 *
 * This is the SINGLE entry point for all retrieval in RegLayer.
 * Routes, agents, and tools call this instead of wiring 6 modules manually.
 */
export async function optimizedRetrieve(
  query: string,
  config?: RetrievalConfig,
): Promise<RetrievalResult> {
  const pipelineStart = Date.now();
  const stages: PipelineStage[] = [];

  // 0. Classify intent and resolve config
  const intent = classifyIntent(query);
  const cfg: Required<RetrievalConfig> = {
    tokenBudget: 6000,
    multiQuery: false,
    rerank: false,
    graph: true,
    knowledge: true,
    cache: true,
    scanId: "",
    workspaceId: "",
    userId: "",
    ...autoPreset(intent),
    ...config,
  };

  // Skip retrieval for conversational queries
  if (intent === "conversational") {
    return {
      context: "",
      tokenCount: 0,
      cached: false,
      intent,
      stages: [{ name: "intent-classify", latencyMs: Date.now() - pipelineStart, resultCount: 0, skipped: false, reason: "conversational — no retrieval" }],
      totalLatencyMs: Date.now() - pipelineStart,
      sourceCount: 0,
    };
  }

  // 1. Cache check
  if (cfg.cache && cfg.userId) {
    const cacheStart = Date.now();
    let queryEmbedding: number[] | undefined;

    // Check embedding cache first to avoid redundant embed calls
    const cachedEmbed = await embeddingLookup(query);
    if (cachedEmbed) {
      queryEmbedding = cachedEmbed;
    }

    const cacheResult = await cacheLookup({
      messages: query,
      userId: cfg.userId,
      feature: "retrieval",
      queryEmbedding,
    });

    stages.push({
      name: "cache-check",
      latencyMs: Date.now() - cacheStart,
      resultCount: cacheResult.hit ? 1 : 0,
      skipped: false,
    });

    if (cacheResult.hit && cacheResult.value) {
      return {
        context: cacheResult.value,
        tokenCount: estimateTokens(cacheResult.value),
        cached: true,
        cacheLayer: cacheResult.layer,
        intent,
        stages,
        totalLatencyMs: Date.now() - pipelineStart,
        sourceCount: 1,
      };
    }
  }

  // 2. Parallel retrieval from all enabled sources
  const chunks: ContextChunk[] = [];

  const retrievalStart = Date.now();
  const retrievalPromises: Promise<void>[] = [];

  // 2a. Hybrid search (violations)
  retrievalPromises.push(
    (async () => {
      const start = Date.now();
      try {
        const searchFn = cfg.multiQuery ? multiQuerySearch : hybridSearch;
        const results = await searchFn(query, {
          limit: 10,
          scanId: cfg.scanId || undefined,
          workspaceId: cfg.workspaceId || undefined,
          rerank: cfg.rerank,
        });
        for (const r of results) {
          chunks.push({
            id: r.id,
            content: formatViolation(r),
            source: "violations",
            relevanceScore: r.score,
            tokenCount: estimateTokens(formatViolation(r)),
          });
        }
        stages.push({ name: "hybrid-search", latencyMs: Date.now() - start, resultCount: results.length, skipped: false });
      } catch {
        stages.push({ name: "hybrid-search", latencyMs: Date.now() - start, resultCount: 0, skipped: true, reason: "error" });
      }
    })(),
  );

  // 2b. Graph RAG
  if (cfg.graph && cfg.workspaceId) {
    retrievalPromises.push(
      (async () => {
        const start = Date.now();
        try {
          const graphResult = await buildGraphContext(query, cfg.workspaceId);
          if (graphResult.context) {
            chunks.push({
              id: "graph-context",
              content: graphResult.context,
              source: "graph",
              relevanceScore: 0.8, // graph context is structured, high baseline relevance
              tokenCount: estimateTokens(graphResult.context),
            });
          }
          stages.push({ name: "graph-rag", latencyMs: Date.now() - start, resultCount: graphResult.entities.length, skipped: false });
        } catch {
          stages.push({ name: "graph-rag", latencyMs: Date.now() - start, resultCount: 0, skipped: true, reason: "error" });
        }
      })(),
    );
  } else {
    stages.push({ name: "graph-rag", latencyMs: 0, resultCount: 0, skipped: true, reason: cfg.graph ? "no workspace" : "disabled" });
  }

  // 2c. Knowledge base
  if (cfg.knowledge && cfg.workspaceId) {
    retrievalPromises.push(
      (async () => {
        const start = Date.now();
        try {
          const kbResults = await searchKnowledge(query, cfg.workspaceId, { limit: 5 });
          for (const r of kbResults) {
            chunks.push({
              id: r.chunkId,
              content: `[${r.documentTitle}] ${r.content}`,
              source: "knowledge",
              relevanceScore: r.similarity,
              tokenCount: estimateTokens(r.content),
              metadata: { documentId: r.documentId },
            });
          }
          stages.push({ name: "knowledge-search", latencyMs: Date.now() - start, resultCount: kbResults.length, skipped: false });
        } catch {
          stages.push({ name: "knowledge-search", latencyMs: Date.now() - start, resultCount: 0, skipped: true, reason: "error" });
        }
      })(),
    );
  } else {
    stages.push({ name: "knowledge-search", latencyMs: 0, resultCount: 0, skipped: true, reason: cfg.knowledge ? "no workspace" : "disabled" });
  }

  // Wait for all retrievals
  await Promise.all(retrievalPromises);

  stages.push({
    name: "parallel-retrieval",
    latencyMs: Date.now() - retrievalStart,
    resultCount: chunks.length,
    skipped: false,
  });

  // 3. Compress to fit budget
  if (chunks.length === 0) {
    return {
      context: "",
      tokenCount: 0,
      cached: false,
      intent,
      stages,
      totalLatencyMs: Date.now() - pipelineStart,
      sourceCount: 0,
    };
  }

  const compressionStart = Date.now();
  const compressed = compressContext(chunks, {
    tokenBudget: cfg.tokenBudget,
    query,
    deduplicate: true,
    extractive: true,
    minRelevance: 0.2,
  });

  stages.push({
    name: "compression",
    latencyMs: Date.now() - compressionStart,
    resultCount: compressed.chunksIncluded,
    skipped: false,
    reason: `${compressed.chunksTotal}→${compressed.chunksIncluded} chunks, ratio ${compressed.ratio.toFixed(2)}`,
  });

  // 4. Cache the result for future hits
  if (cfg.cache && cfg.userId && compressed.compressed) {
    // Fire-and-forget — don't block the response
    cacheStore({
      messages: query,
      userId: cfg.userId,
      feature: "retrieval",
      response: compressed.compressed,
    }).catch(() => {});

    // Also cache the query embedding for semantic cache
    if (!await embeddingLookup(query)) {
      embed({ input: query, metadata: { feature: "retrieval-cache" } })
        .then((r) => {
          if (r?.embeddings[0]) {
            embeddingStore(query, r.embeddings[0]).catch(() => {});
          }
        })
        .catch(() => {});
    }
  }

  const sources = new Set(chunks.map((c) => c.source));

  return {
    context: compressed.compressed,
    tokenCount: compressed.tokenCount,
    cached: false,
    intent,
    stages,
    totalLatencyMs: Date.now() - pipelineStart,
    sourceCount: sources.size,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatViolation(v: HybridSearchResult): string {
  return `[${v.ruleId}] (${v.impact}) ${v.description}${v.wcagCriteria ? ` — WCAG ${v.wcagCriteria}` : ""}\nFix: ${v.help}`;
}
