/**
 * RegLayer — Vector Search Service
 *
 * WHY:  Semantic search over accessibility violations. When a user searches
 *       "color contrast problems" or "text readability issues," keyword matching
 *       fails. Vector similarity finds semantically related violations regardless
 *       of exact wording.
 *
 * HOW IT WORKS:
 *   1. When a violation is created/updated, we generate an embedding from its
 *      description + help text + WCAG tags using the AI Gateway's embed().
 *   2. The embedding (a 1536-dimensional float vector) is stored in the
 *      violation's `embedding` column via pgvector.
 *   3. On search, we embed the user's query and find the nearest violations
 *      using cosine distance (<=> operator in pgvector).
 *
 * WHY RAW SQL (not Prisma queries):
 *   Prisma doesn't support vector types or distance operators natively.
 *   The pgvector `<=>` operator for cosine distance is PostgreSQL-specific.
 *   We use Prisma's $queryRaw for vector operations and standard Prisma
 *   for everything else. This is the recommended pattern.
 *
 * ARCHITECTURE NOTE:
 *   This module doesn't depend on API routes or React — it's a pure service
 *   layer that can be called from API routes, background jobs, or agents.
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { embed } from "@/lib/ai/gateway";
import { Prisma } from "@/generated/prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ViolationSearchResult {
  id: string;
  ruleId: string;
  impact: string;
  description: string;
  help: string;
  wcagCriteria: string | null;
  scanId: string;
  similarity: number;
}

// ── Embedding Generation ──────────────────────────────────────────────────────

/**
 * Build the text to embed for a violation.
 * Combines description, help, and WCAG tags into a single string
 * that captures the violation's semantic meaning.
 */
function buildViolationEmbeddingText(violation: {
  ruleId: string;
  description: string;
  help: string;
  tags?: string[];
  wcagCriteria?: string | null;
}): string {
  const parts = [
    violation.ruleId,
    violation.description,
    violation.help,
  ];
  if (violation.wcagCriteria) {
    parts.push(`WCAG ${violation.wcagCriteria}`);
  }
  if (violation.tags?.length) {
    parts.push(violation.tags.join(", "));
  }
  return parts.join(" | ");
}

/**
 * Generate and store an embedding for a single violation.
 * Called after a scan completes to index violations for semantic search.
 */
export async function embedViolation(violationId: string): Promise<boolean> {
  const violation = await prisma.violation.findUnique({
    where: { id: violationId },
    select: {
      id: true,
      ruleId: true,
      description: true,
      help: true,
      tags: true,
      wcagCriteria: true,
    },
  });

  if (!violation) return false;

  const text = buildViolationEmbeddingText(violation);
  const result = await embed({
    input: text,
    metadata: { feature: "violation-embedding" },
  });

  if (!result || result.embeddings.length === 0) return false;

  const vector = result.embeddings[0];
  const vectorStr = `[${vector.join(",")}]`;

  await prisma.$executeRaw`
    UPDATE violations
    SET embedding = ${vectorStr}::vector
    WHERE id = ${violation.id}
  `;

  return true;
}

/**
 * Batch embed all violations for a scan.
 * Called after scan completion to index all new violations.
 */
export async function embedScanViolations(scanId: string): Promise<number> {
  const violations = await prisma.violation.findMany({
    where: { scanId },
    select: {
      id: true,
      ruleId: true,
      description: true,
      help: true,
      tags: true,
      wcagCriteria: true,
    },
  });

  if (violations.length === 0) return 0;

  // Process in batches of 100 (OpenAI limit is 2048, but smaller batches are safer)
  const BATCH_SIZE = 100;
  let stored = 0;

  for (let batchStart = 0; batchStart < violations.length; batchStart += BATCH_SIZE) {
    const batch = violations.slice(batchStart, batchStart + BATCH_SIZE);
    const texts = batch.map(buildViolationEmbeddingText);

    const result = await embed({
      input: texts,
      metadata: { feature: "violation-embedding" },
    });

    if (!result || result.embeddings.length !== batch.length) continue;

    for (let i = 0; i < batch.length; i++) {
      const vectorStr = `[${result.embeddings[i].join(",")}]`;
      try {
        await prisma.$executeRaw`
          UPDATE violations
          SET embedding = ${vectorStr}::vector
          WHERE id = ${batch[i].id}
        `;
        stored++;
      } catch {
        // Skip individual failures — don't block the batch
      }
    }
  }

  return stored;
}

// ── Semantic Search ───────────────────────────────────────────────────────────

/**
 * Search violations by semantic similarity to a query string.
 *
 * @param query - Natural language search query (e.g., "color contrast issues")
 * @param options - Search options
 * @returns Violations sorted by similarity (closest first)
 *
 * @example
 * const results = await searchViolations("text readability problems", {
 *   limit: 10,
 *   minSimilarity: 0.7,
 *   scanId: "scan_123",  // optional: scope to a specific scan
 * });
 */
export async function searchViolations(
  query: string,
  options?: {
    limit?: number;
    minSimilarity?: number;
    scanId?: string;
  },
): Promise<ViolationSearchResult[]> {
  const limit = options?.limit ?? 10;
  const minSimilarity = options?.minSimilarity ?? 0.5;

  // Fast check: skip expensive embed + search if no violations have embeddings yet
  try {
    const hasEmbeddings = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM violations WHERE embedding IS NOT NULL LIMIT 1
    `;
    if (!hasEmbeddings[0] || hasEmbeddings[0].count === BigInt(0)) {
      return [];
    }
  } catch {
    // pgvector not enabled or table doesn't have column — skip silently
    return [];
  }

  // 1. Embed the search query
  const result = await embed({
    input: query,
    metadata: { feature: "violation-search" },
  });

  if (!result || result.embeddings.length === 0) return [];

  const queryVector = `[${result.embeddings[0].join(",")}]`;

  // 2. Find nearest violations using cosine distance
  // pgvector's <=> operator returns cosine distance (0 = identical, 2 = opposite).
  // We convert to similarity: 1 - distance.
  const scanFilter = options?.scanId
    ? Prisma.sql`AND v."scanId" = ${options.scanId}`
    : Prisma.sql``;

  const results = await prisma.$queryRaw<ViolationSearchResult[]>`
    SELECT * FROM (
      SELECT
        v.id,
        v."ruleId",
        v.impact::text,
        v.description,
        v.help,
        v."wcagCriteria",
        v."scanId",
        1 - (v.embedding <=> ${queryVector}::vector) AS similarity
      FROM violations v
      WHERE v.embedding IS NOT NULL
        ${scanFilter}
      ORDER BY v.embedding <=> ${queryVector}::vector
      LIMIT ${limit}
    ) sub
    WHERE sub.similarity >= ${minSimilarity}
  `;

  return results;
}
