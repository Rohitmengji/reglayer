/**
 * RegLayer — Hybrid Search Engine
 *
 * Combines three retrieval strategies for superior RAG results:
 *   1. Dense search  — pgvector cosine similarity (semantic meaning)
 *   2. Sparse search — PostgreSQL full-text search with ts_rank (exact terms)
 *   3. Keyword match  — direct field matching (rule IDs, WCAG criteria)
 *
 * Results are merged using Reciprocal Rank Fusion (RRF), then optionally
 * reranked by an LLM cross-encoder for final relevance scoring.
 *
 * WHY HYBRID > VECTOR-ONLY:
 *   Pure vector search misses when:
 *   - User queries exact rule IDs: "color-contrast" (keyword wins)
 *   - User quotes WCAG criteria: "SC 1.4.3" (keyword wins)
 *   - Query is short/ambiguous: "aria" (sparse BM25 wins)
 *   - Query uses domain jargon the embedding model wasn't trained on
 *
 *   Hybrid search catches ALL of these while keeping semantic understanding.
 *
 * ARCHITECTURE:
 *   Query → Rewrite → [Dense, Sparse, Keyword] → RRF Merge → Rerank → Results
 *
 * INSPIRED BY:
 *   - Perplexity (hybrid retrieval + reranking)
 *   - Elastic/OpenSearch (BM25 + kNN in one query)
 *   - Cohere Rerank (cross-encoder reranking API)
 *   - Pinecone (hybrid sparse+dense in single index)
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { embed, complete } from "@/lib/ai/gateway";
import { Prisma } from "@/generated/prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HybridSearchResult {
  id: string;
  ruleId: string;
  impact: string;
  description: string;
  help: string;
  wcagCriteria: string | null;
  scanId: string;
  /** Final relevance score (0–1) after fusion + optional reranking */
  score: number;
  /** Which retrieval strategies found this result */
  sources: ("dense" | "sparse" | "keyword")[];
}

export interface HybridSearchOptions {
  limit?: number;
  minScore?: number;
  scanId?: string;
  workspaceId?: string;
  /** Enable LLM-based cross-encoder reranking (costs ~1 API call) */
  rerank?: boolean;
  /** Weights for each strategy in RRF (default: equal) */
  weights?: { dense?: number; sparse?: number; keyword?: number };
}

// ── Query Rewriting ───────────────────────────────────────────────────────────

/**
 * Expand/rewrite a user query for better retrieval.
 * Adds synonyms and WCAG-specific expansions without an LLM call.
 */
export function rewriteQuery(query: string): { dense: string; sparse: string } {
  const lower = query.toLowerCase().trim();

  // Expand common accessibility synonyms for the dense (semantic) search
  const expansions: Record<string, string> = {
    "color contrast": "color contrast ratio WCAG 1.4.3 text readability",
    "alt text": "alternative text image description WCAG 1.1.1",
    "keyboard": "keyboard navigation focus tab order WCAG 2.1.1",
    "screen reader": "screen reader assistive technology ARIA accessibility tree",
    "heading": "heading hierarchy structure h1 h2 h3 document outline WCAG 1.3.1",
    "form": "form label input accessible name WCAG 1.3.1 4.1.2",
    "link": "link purpose descriptive text WCAG 2.4.4",
    "focus": "focus visible indicator outline WCAG 2.4.7",
    "aria": "ARIA roles states properties WAI-ARIA accessible rich internet",
    "landmark": "landmark region navigation main header footer ARIA",
  };

  let denseQuery = query;
  for (const [term, expansion] of Object.entries(expansions)) {
    if (lower.includes(term)) {
      denseQuery = `${query} ${expansion}`;
      break; // One expansion is enough to avoid noise
    }
  }

  // For sparse search, extract key terms (strip filler words)
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "shall", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "about", "between",
    "through", "after", "before", "during", "and", "or", "but", "not",
    "this", "that", "these", "those", "it", "its", "my", "your", "our",
    "what", "which", "how", "show", "me", "find", "get", "list", "all",
  ]);

  const sparseTerms = query
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w.toLowerCase()))
    .join(" ");

  return {
    dense: denseQuery,
    sparse: sparseTerms || query, // fallback to original if all filtered
  };
}

// ── Dense Search (Vector Similarity) ──────────────────────────────────────────

async function denseSearch(
  query: string,
  opts: HybridSearchOptions,
): Promise<Map<string, { rank: number; data: HybridSearchResult }>> {
  const results = new Map<string, { rank: number; data: HybridSearchResult }>();
  const limit = (opts.limit ?? 10) * 2; // Fetch more for fusion

  // Check if embeddings exist
  try {
    const hasEmbeddings = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM violations WHERE embedding IS NOT NULL LIMIT 1
    `;
    if (!hasEmbeddings[0] || hasEmbeddings[0].count === BigInt(0)) return results;
  } catch {
    return results;
  }

  const embeddingResult = await embed({
    input: query,
    metadata: { feature: "hybrid-search-dense" },
  });

  if (!embeddingResult || embeddingResult.embeddings.length === 0) return results;

  const queryVector = `[${embeddingResult.embeddings[0].join(",")}]`;

  const scanFilter = opts.scanId
    ? Prisma.sql`AND v."scanId" = ${opts.scanId}`
    : Prisma.sql``;

  const wsFilter = opts.workspaceId
    ? Prisma.sql`AND v."scanId" IN (SELECT id FROM scans WHERE "workspaceId" = ${opts.workspaceId})`
    : Prisma.sql``;

  const rows = await prisma.$queryRaw<Array<{
    id: string; ruleId: string; impact: string; description: string;
    help: string; wcagCriteria: string | null; scanId: string; similarity: number;
  }>>(Prisma.sql`
    SELECT
      v.id, v."ruleId", v.impact::text, v.description, v.help,
      v."wcagCriteria", v."scanId",
      1 - (v.embedding <=> ${queryVector}::vector) AS similarity
    FROM violations v
    WHERE v.embedding IS NOT NULL
      ${scanFilter} ${wsFilter}
    ORDER BY v.embedding <=> ${queryVector}::vector
    LIMIT ${limit}
  `);

  rows.forEach((row, i) => {
    results.set(row.id, {
      rank: i + 1,
      data: {
        id: row.id,
        ruleId: row.ruleId,
        impact: row.impact,
        description: row.description,
        help: row.help,
        wcagCriteria: row.wcagCriteria,
        scanId: row.scanId,
        score: row.similarity,
        sources: ["dense"],
      },
    });
  });

  return results;
}

// ── Sparse Search (PostgreSQL Full-Text) ──────────────────────────────────────

async function sparseSearch(
  query: string,
  opts: HybridSearchOptions,
): Promise<Map<string, { rank: number; data: HybridSearchResult }>> {
  const results = new Map<string, { rank: number; data: HybridSearchResult }>();
  const limit = (opts.limit ?? 10) * 2;

  if (!query.trim()) return results;

  // Convert query to tsquery format: "color contrast" → "color & contrast"
  const tsQueryTerms = query
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean)
    .join(" | "); // OR semantics for broader recall

  if (!tsQueryTerms) return results;

  const scanFilter = opts.scanId
    ? Prisma.sql`AND v."scanId" = ${opts.scanId}`
    : Prisma.sql``;

  const wsFilter = opts.workspaceId
    ? Prisma.sql`AND v."scanId" IN (SELECT id FROM scans WHERE "workspaceId" = ${opts.workspaceId})`
    : Prisma.sql``;

  try {
    const rows = await prisma.$queryRaw<Array<{
      id: string; ruleId: string; impact: string; description: string;
      help: string; wcagCriteria: string | null; scanId: string; rank: number;
    }>>(Prisma.sql`
      SELECT
        v.id, v."ruleId", v.impact::text, v.description, v.help,
        v."wcagCriteria", v."scanId",
        ts_rank(
          to_tsvector('english', v.description || ' ' || v.help || ' ' || COALESCE(v."ruleId", '') || ' ' || COALESCE(v."wcagCriteria", '')),
          to_tsquery('english', ${tsQueryTerms})
        ) AS rank
      FROM violations v
      WHERE to_tsvector('english', v.description || ' ' || v.help || ' ' || COALESCE(v."ruleId", '') || ' ' || COALESCE(v."wcagCriteria", ''))
            @@ to_tsquery('english', ${tsQueryTerms})
        ${scanFilter} ${wsFilter}
      ORDER BY rank DESC
      LIMIT ${limit}
    `);

    rows.forEach((row, i) => {
      results.set(row.id, {
        rank: i + 1,
        data: {
          id: row.id,
          ruleId: row.ruleId,
          impact: row.impact,
          description: row.description,
          help: row.help,
          wcagCriteria: row.wcagCriteria,
          scanId: row.scanId,
          score: Math.min(row.rank, 1), // normalize ts_rank
          sources: ["sparse"],
        },
      });
    });
  } catch {
    // Full-text search may fail if tsvector config isn't available — degrade gracefully
  }

  return results;
}

// ── Keyword Search (Exact Match) ──────────────────────────────────────────────

async function keywordSearch(
  query: string,
  opts: HybridSearchOptions,
): Promise<Map<string, { rank: number; data: HybridSearchResult }>> {
  const results = new Map<string, { rank: number; data: HybridSearchResult }>();
  const limit = (opts.limit ?? 10) * 2;

  // Extract potential rule IDs and WCAG criteria from the query
  const ruleIdMatch = query.match(/\b([a-z]+-[a-z-]+)\b/i); // e.g., "color-contrast"
  const wcagMatch = query.match(/\b(\d+\.\d+\.\d+)\b/); // e.g., "1.4.3"

  const conditions: Prisma.Sql[] = [];

  if (ruleIdMatch) {
    conditions.push(Prisma.sql`v."ruleId" ILIKE ${"%" + ruleIdMatch[1] + "%"}`);
  }
  if (wcagMatch) {
    conditions.push(Prisma.sql`v."wcagCriteria" = ${wcagMatch[1]}`);
  }

  // Also do ILIKE on description for direct term matches
  const significantTerms = query
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 3); // max 3 terms to avoid slow queries

  for (const term of significantTerms) {
    conditions.push(Prisma.sql`v.description ILIKE ${"%" + term + "%"}`);
  }

  if (conditions.length === 0) return results;

  const whereClause = Prisma.sql`(${Prisma.join(conditions, " OR ")})`;

  const scanFilter = opts.scanId
    ? Prisma.sql`AND v."scanId" = ${opts.scanId}`
    : Prisma.sql``;

  const wsFilter = opts.workspaceId
    ? Prisma.sql`AND v."scanId" IN (SELECT id FROM scans WHERE "workspaceId" = ${opts.workspaceId})`
    : Prisma.sql``;

  try {
    const rows = await prisma.$queryRaw<Array<{
      id: string; ruleId: string; impact: string; description: string;
      help: string; wcagCriteria: string | null; scanId: string;
    }>>(Prisma.sql`
      SELECT v.id, v."ruleId", v.impact::text, v.description, v.help,
             v."wcagCriteria", v."scanId"
      FROM violations v
      WHERE ${whereClause} ${scanFilter} ${wsFilter}
      ORDER BY v."createdAt" DESC
      LIMIT ${limit}
    `);

    rows.forEach((row, i) => {
      results.set(row.id, {
        rank: i + 1,
        data: {
          id: row.id,
          ruleId: row.ruleId,
          impact: row.impact,
          description: row.description,
          help: row.help,
          wcagCriteria: row.wcagCriteria,
          scanId: row.scanId,
          score: 1.0, // exact match = max confidence
          sources: ["keyword"],
        },
      });
    });
  } catch {
    // Keyword search failure is non-fatal
  }

  return results;
}

// ── Reciprocal Rank Fusion (RRF) ──────────────────────────────────────────────

/**
 * Merge ranked results from multiple retrieval strategies.
 *
 * RRF formula: score(d) = Σ 1 / (k + rank_i(d))
 * where k=60 is the fusion constant (standard in the literature).
 *
 * This is the same algorithm used by Elastic, MongoDB Atlas Search, and
 * Pinecone for hybrid retrieval. It's robust because it only uses rank
 * positions, not raw scores (which are incomparable across strategies).
 */
function reciprocalRankFusion(
  resultSets: Map<string, { rank: number; data: HybridSearchResult }>[],
  weights: { dense: number; sparse: number; keyword: number },
  limit: number,
): HybridSearchResult[] {
  const K = 60; // fusion constant (standard value from the RRF paper)
  const fused = new Map<string, { score: number; data: HybridSearchResult; sources: Set<string> }>();

  const weightList = [weights.dense, weights.sparse, weights.keyword];
  const sourceLabels: ("dense" | "sparse" | "keyword")[] = ["dense", "sparse", "keyword"];

  for (let i = 0; i < resultSets.length; i++) {
    const results = resultSets[i];
    const weight = weightList[i];

    for (const [id, { rank, data }] of results) {
      const rrfScore = weight / (K + rank);

      if (fused.has(id)) {
        const existing = fused.get(id)!;
        existing.score += rrfScore;
        existing.sources.add(sourceLabels[i]);
      } else {
        fused.set(id, {
          score: rrfScore,
          data,
          sources: new Set([sourceLabels[i]]),
        });
      }
    }
  }

  // Sort by fused score (descending) and return top N
  return Array.from(fused.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score, data, sources }) => ({
      ...data,
      score,
      sources: Array.from(sources) as ("dense" | "sparse" | "keyword")[],
    }));
}

// ── Cross-Encoder Reranker ────────────────────────────────────────────────────

/**
 * LLM-based reranking: score each result's relevance to the query.
 * Costs ~1 API call but significantly improves precision.
 *
 * This is the same pattern used by Cohere Rerank, Jina Reranker, and
 * BGE-reranker — but using our existing LLM gateway instead of a
 * separate reranking API.
 */
async function rerankWithLLM(
  query: string,
  results: HybridSearchResult[],
): Promise<HybridSearchResult[]> {
  if (results.length <= 1) return results;

  // Cap at 10 to control costs
  const toRerank = results.slice(0, 10);

  const prompt = `You are a relevance scorer for accessibility compliance search results.

Given the user's search query and a list of accessibility violation descriptions, score each result's relevance from 0.0 (irrelevant) to 1.0 (perfectly relevant).

Respond with ONLY a JSON array of numbers, one score per result, in the same order.

Query: "${query}"

Results:
${toRerank.map((r, i) => `${i + 1}. [${r.ruleId}] ${r.description} (${r.help})`).join("\n")}

Scores (JSON array):`;

  try {
    const response = await complete({
      model: "gpt-4o-mini" as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      maxTokens: 100,
      metadata: { feature: "hybrid-search-rerank" },
    });

    if (!response) return results;

    // Parse the scores
    const scoreMatch = response.content.match(/\[[\d.,\s]+\]/);
    if (!scoreMatch) return results;

    const scores: number[] = JSON.parse(scoreMatch[0]);

    // Apply reranking scores
    const reranked = toRerank
      .map((r, i) => ({
        ...r,
        score: scores[i] !== undefined ? scores[i] : r.score,
      }))
      .sort((a, b) => b.score - a.score);

    // Append any results beyond the reranked set
    return [...reranked, ...results.slice(10)];
  } catch {
    // Reranking failure is non-fatal — return original order
    return results;
  }
}

// ── Multi-Query Retrieval ─────────────────────────────────────────────────────

/**
 * Generate multiple search queries from a single user question.
 *
 * A single query captures ONE angle. "color contrast issues" won't find
 * results described as "insufficient luminance ratio" or "text readability".
 * Multi-query generates 3 reformulations and merges all results.
 *
 * This is the same approach used by:
 *   - LangChain MultiQueryRetriever
 *   - LlamaIndex SubQuestionQueryEngine
 *   - Perplexity (decompose → search → merge)
 */
export async function generateMultiQueries(query: string): Promise<string[]> {
  const response = await complete({
    model: "gpt-4o-mini" as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    messages: [{
      role: "user",
      content: `Generate 3 alternative search queries for finding accessibility violations related to this question. Each query should approach the topic from a different angle (synonyms, related concepts, specific WCAG criteria).

Original question: "${query}"

Return ONLY a JSON array of 3 strings. No explanation.`,
    }],
    temperature: 0.7,
    maxTokens: 200,
    metadata: { feature: "multi-query-generation" },
  });

  if (!response) return [query];

  try {
    const match = response.content.match(/\[[\s\S]*\]/);
    if (!match) return [query];
    const queries: string[] = JSON.parse(match[0]);
    // Always include the original + up to 3 generated
    return [query, ...queries.slice(0, 3).filter((q) => typeof q === "string" && q.length > 0)];
  } catch {
    return [query];
  }
}

// ── Main Entry Points ─────────────────────────────────────────────────────────

/**
 * Hybrid search across violations using dense + sparse + keyword retrieval.
 *
 * This is the primary search function for the RAG pipeline. It replaces
 * the vector-only `searchViolations()` with a multi-strategy approach
 * that catches both semantic and exact-match queries.
 *
 * @param query   Natural language search query
 * @param options Search configuration
 * @returns       Ranked results after fusion and optional reranking
 */
export async function hybridSearch(
  query: string,
  options?: HybridSearchOptions,
): Promise<HybridSearchResult[]> {
  const opts: HybridSearchOptions = {
    limit: 10,
    minScore: 0,
    rerank: false,
    weights: { dense: 1.0, sparse: 0.8, keyword: 0.6 },
    ...options,
  };

  // 1. Rewrite query for each strategy
  const rewritten = rewriteQuery(query);

  // 2. Run all three strategies in parallel
  const [denseResults, sparseResults, keywordResults] = await Promise.all([
    denseSearch(rewritten.dense, opts),
    sparseSearch(rewritten.sparse, opts),
    keywordSearch(query, opts), // keyword uses original query for exact matching
  ]);

  // 3. Fuse results using Reciprocal Rank Fusion
  const weights = {
    dense: opts.weights?.dense ?? 1.0,
    sparse: opts.weights?.sparse ?? 0.8,
    keyword: opts.weights?.keyword ?? 0.6,
  };
  const fused = reciprocalRankFusion(
    [denseResults, sparseResults, keywordResults],
    weights,
    opts.limit! * 2, // fetch extra for reranking
  );

  if (fused.length === 0) return [];

  // 4. Optional: LLM cross-encoder reranking
  const ranked = opts.rerank ? await rerankWithLLM(query, fused) : fused;

  // 5. Filter by minimum score and return top N
  return ranked
    .filter((r) => r.score >= (opts.minScore ?? 0))
    .slice(0, opts.limit!);
}

/**
 * Multi-query hybrid search — the most thorough retrieval mode.
 *
 * Generates multiple reformulations of the query, runs hybrid search for
 * each, then deduplicates and re-fuses. Costs ~1 extra LLM call for query
 * generation but dramatically improves recall on complex questions.
 *
 * Use this for:
 *   - RAG-augmented chat (user asks complex questions)
 *   - Agent tool calls (agent needs comprehensive data)
 *   - Report generation (need all relevant violations)
 *
 * DON'T use this for:
 *   - Autocomplete/typeahead (too slow, use keyword only)
 *   - Simple lookups by rule ID (use keyword search directly)
 */
export async function multiQuerySearch(
  query: string,
  options?: HybridSearchOptions,
): Promise<HybridSearchResult[]> {
  const opts: HybridSearchOptions = {
    limit: 10,
    minScore: 0,
    rerank: false,
    ...options,
  };

  // 1. Generate multiple query reformulations
  const queries = await generateMultiQueries(query);

  // 2. Run hybrid search for each query in parallel
  const allResults = await Promise.all(
    queries.map((q) => hybridSearch(q, { ...opts, limit: (opts.limit ?? 10) * 2, rerank: false })),
  );

  // 3. Deduplicate by ID, keeping highest score
  const deduped = new Map<string, HybridSearchResult>();
  for (const results of allResults) {
    for (const result of results) {
      const existing = deduped.get(result.id);
      if (!existing || result.score > existing.score) {
        // Merge sources from all appearances
        const mergedSources = new Set([
          ...(existing?.sources ?? []),
          ...result.sources,
        ]);
        deduped.set(result.id, {
          ...result,
          sources: Array.from(mergedSources) as ("dense" | "sparse" | "keyword")[],
        });
      }
    }
  }

  // 4. Sort by score and apply limit
  let ranked = Array.from(deduped.values()).sort((a, b) => b.score - a.score);

  // 5. Optional reranking on the merged set
  if (opts.rerank) {
    ranked = await rerankWithLLM(query, ranked);
  }

  return ranked
    .filter((r) => r.score >= (opts.minScore ?? 0))
    .slice(0, opts.limit!);
}
