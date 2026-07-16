/**
 * RegLayer — Knowledge Management Service
 *
 * Upload company documents → chunk → embed → RAG over custom knowledge.
 *
 * WHY: Without this, the AI can only answer from WCAG spec + scan data.
 * With Knowledge Management, enterprises can upload their own accessibility
 * policies, remediation guides, internal standards, and legal requirements —
 * and the AI answers questions grounded in THEIR specific documentation.
 *
 * ARCHITECTURE:
 *   Upload → Parse text → Chunk (512 tokens, 50 overlap) → Embed → Store
 *   Query  → Embed query → Cosine similarity search → Return top K chunks
 *
 * INSPIRED BY:
 *   - Perplexity (web pages → chunks → RAG)
 *   - Glean (enterprise docs → embeddings → search)
 *   - NotebookLM (uploaded PDFs → grounded chat)
 *   - Harvey (case law → legal RAG)
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { embed } from "@/lib/ai/gateway";
import { Prisma } from "@/generated/prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type KnowledgeStatus = "PROCESSING" | "READY" | "FAILED";

export interface KnowledgeDocumentEntry {
  id: string;
  title: string;
  source: string;
  mimeType: string;
  sizeBytes: number;
  status: KnowledgeStatus;
  chunkCount: number;
  errorMessage: string | null;
  createdAt: Date;
}

export interface KnowledgeSearchResult {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  chunkIndex: number;
  similarity: number;
  metadata: unknown;
}

// ── Document Management ───────────────────────────────────────────────────────

/**
 * Register a new document for processing.
 * Call this first, then process the content asynchronously.
 */
export async function createDocument(opts: {
  title: string;
  source: string;
  mimeType: string;
  sizeBytes: number;
  workspaceId: string;
  uploadedBy: string;
}): Promise<KnowledgeDocumentEntry> {
  const doc = await prisma.knowledgeDocument.create({
    data: {
      title: opts.title,
      source: opts.source,
      mimeType: opts.mimeType,
      sizeBytes: opts.sizeBytes,
      workspaceId: opts.workspaceId,
      uploadedBy: opts.uploadedBy,
    },
  });

  return mapDoc(doc);
}

/**
 * List documents in a workspace.
 */
export async function listDocuments(
  workspaceId: string,
  opts?: { status?: KnowledgeStatus; limit?: number },
): Promise<KnowledgeDocumentEntry[]> {
  const docs = await prisma.knowledgeDocument.findMany({
    where: {
      workspaceId,
      ...(opts?.status ? { status: opts.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: opts?.limit ?? 50,
  });

  return docs.map(mapDoc);
}

/**
 * Delete a document and all its chunks (cascade).
 */
export async function deleteDocument(id: string, workspaceId: string): Promise<boolean> {
  const result = await prisma.knowledgeDocument.deleteMany({
    where: { id, workspaceId },
  });
  return result.count > 0;
}

// ── Chunking ──────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 512;    // target tokens per chunk (~2048 chars)
const CHUNK_OVERLAP = 50;  // overlap tokens between chunks for context continuity
const CHARS_PER_TOKEN = 4; // rough English average

/**
 * Split text into overlapping chunks for embedding.
 * Uses sentence-boundary aware splitting to avoid cutting mid-sentence.
 */
export function chunkText(text: string): string[] {
  const chunkChars = CHUNK_SIZE * CHARS_PER_TOKEN;
  const overlapChars = CHUNK_OVERLAP * CHARS_PER_TOKEN;

  // Split into sentences first
  const sentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [text];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if ((current + " " + trimmed).length > chunkChars && current.length > 0) {
      chunks.push(current.trim());
      // Keep overlap from end of previous chunk
      const words = current.split(/\s+/);
      const overlapWords = Math.floor(overlapChars / 5); // ~5 chars per word
      current = words.slice(-overlapWords).join(" ") + " " + trimmed;
    } else {
      current = current ? current + " " + trimmed : trimmed;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

/**
 * Process a document: chunk the text and embed each chunk.
 * Call this after createDocument() with the extracted text content.
 */
export async function processDocument(
  documentId: string,
  textContent: string,
): Promise<{ success: boolean; chunkCount: number; error?: string }> {
  try {
    const chunks = chunkText(textContent);

    if (chunks.length === 0) {
      await prisma.knowledgeDocument.update({
        where: { id: documentId },
        data: { status: "FAILED", errorMessage: "No content to process" },
      });
      return { success: false, chunkCount: 0, error: "No content to process" };
    }

    // Create chunks in DB
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const tokenCount = Math.ceil(chunk.length / CHARS_PER_TOKEN);

      const created = await prisma.knowledgeChunk.create({
        data: {
          documentId,
          content: chunk,
          chunkIndex: i,
          tokenCount,
        },
      });

      // Embed and store vector (best-effort per chunk)
      try {
        const result = await embed({
          input: chunk,
          metadata: { feature: "knowledge-embedding" },
        });

        if (result && result.embeddings.length > 0) {
          const vector = result.embeddings[0];
          const vectorStr = `[${vector.join(",")}]`;
          await prisma.$executeRaw`
            UPDATE knowledge_chunks
            SET embedding = ${vectorStr}::vector
            WHERE id = ${created.id}
          `;
        }
      } catch {
        // Embedding failure for one chunk shouldn't fail the whole document
      }
    }

    // Mark as ready
    await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { status: "READY", chunkCount: chunks.length },
    });

    return { success: true, chunkCount: chunks.length };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Processing failed";
    await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { status: "FAILED", errorMessage: error },
    });
    return { success: false, chunkCount: 0, error };
  }
}

// ── Semantic Search ───────────────────────────────────────────────────────────

/**
 * Search knowledge base chunks by semantic similarity.
 * Used by the RAG pipeline to find relevant context from uploaded documents.
 */
export async function searchKnowledge(
  query: string,
  workspaceId: string,
  opts?: { limit?: number; minSimilarity?: number },
): Promise<KnowledgeSearchResult[]> {
  const limit = opts?.limit ?? 5;
  const minSimilarity = opts?.minSimilarity ?? 0.6;

  // Check if any chunks have embeddings
  const hasEmbeddings = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM knowledge_chunks kc
    JOIN knowledge_documents kd ON kc."documentId" = kd.id
    WHERE kd."workspaceId" = ${workspaceId}
      AND kd.status = 'READY'
      AND kc.embedding IS NOT NULL
  `;

  if (!hasEmbeddings[0] || Number(hasEmbeddings[0].count) === 0) {
    return [];
  }

  // Embed the query
  const queryEmbedding = await embed({
    input: query,
    metadata: { feature: "knowledge-search" },
  });

  if (!queryEmbedding || queryEmbedding.embeddings.length === 0) {
    return [];
  }

  const queryVector = `[${queryEmbedding.embeddings[0].join(",")}]`;

  // Cosine similarity search
  const results = await prisma.$queryRaw<Array<{
    id: string;
    documentId: string;
    title: string;
    content: string;
    chunkIndex: number;
    metadata: unknown;
    similarity: number;
  }>>(Prisma.sql`
    SELECT
      kc.id,
      kc."documentId",
      kd.title,
      kc.content,
      kc."chunkIndex",
      kc.metadata,
      1 - (kc.embedding <=> ${queryVector}::vector) as similarity
    FROM knowledge_chunks kc
    JOIN knowledge_documents kd ON kc."documentId" = kd.id
    WHERE kd."workspaceId" = ${workspaceId}
      AND kd.status = 'READY'
      AND kc.embedding IS NOT NULL
      AND 1 - (kc.embedding <=> ${queryVector}::vector) >= ${minSimilarity}
    ORDER BY kc.embedding <=> ${queryVector}::vector
    LIMIT ${limit}
  `);

  return results.map((r) => ({
    chunkId: r.id,
    documentId: r.documentId,
    documentTitle: r.title,
    content: r.content,
    chunkIndex: r.chunkIndex,
    similarity: r.similarity,
    metadata: r.metadata,
  }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapDoc(row: {
  id: string;
  title: string;
  source: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  chunkCount: number;
  errorMessage: string | null;
  createdAt: Date;
}): KnowledgeDocumentEntry {
  return {
    id: row.id,
    title: row.title,
    source: row.source,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    status: row.status as KnowledgeStatus,
    chunkCount: row.chunkCount,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
  };
}
