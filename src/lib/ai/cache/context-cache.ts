/**
 * RegLayer — Multi-Layer Context Cache
 *
 * 4 cache layers that progressively reduce LLM costs and latency:
 *
 *   Layer 1: Exact Match (Redis)     — identical prompt → same response
 *   Layer 2: Semantic Cache          — similar question → reuse answer
 *   Layer 3: Prompt Cache (provider) — shared prefix → reduced input cost
 *   Layer 4: Embedding Cache         — skip re-embedding known text
 *
 * COST IMPACT:
 *   Without cache: every question → embed + search + LLM = $0.001-0.005
 *   With cache:    repeated/similar questions → $0.00 (cache hit)
 *
 *   At 1000 queries/day, caching saves $30-150/month just on LLM costs.
 *   For enterprise with 50 users asking similar questions, savings multiply.
 *
 * ARCHITECTURE:
 *   ┌─────────────┐
 *   │   Request    │
 *   └──────┬──────┘
 *          ▼
 *   ┌─────────────┐     hit
 *   │ Exact Cache │────────────→ Return cached response
 *   └──────┬──────┘
 *          │ miss
 *          ▼
 *   ┌─────────────┐     hit (similarity > 0.95)
 *   │Semantic Cache│───────────→ Return similar response
 *   └──────┬──────┘
 *          │ miss
 *          ▼
 *   ┌─────────────┐     hit
 *   │Embedding    │────────────→ Skip embed API call
 *   │Cache        │
 *   └──────┬──────┘
 *          │ miss
 *          ▼
 *   ┌─────────────┐
 *   │ LLM Call    │ (with prompt cache prefix if supported)
 *   └──────┬──────┘
 *          │
 *          ▼
 *   Store in all cache layers
 *
 * INSPIRED BY:
 *   - GPTCache (semantic similarity caching for LLM)
 *   - Anthropic Prompt Caching (shared system prompt prefix)
 *   - Redis Semantic Caching (vector similarity on cached keys)
 *   - Momento (serverless cache with TTL)
 */

import "server-only";

import { getRedis } from "@/lib/cache/redis";
import { createHash } from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CacheConfig {
  /** TTL for exact-match cache entries (seconds) */
  exactTtl: number;
  /** TTL for semantic cache entries (seconds) */
  semanticTtl: number;
  /** TTL for embedding cache entries (seconds) */
  embeddingTtl: number;
  /** Minimum similarity score for semantic cache hit (0-1) */
  semanticThreshold: number;
  /** Whether to use Redis (falls back to in-memory if unavailable) */
  useRedis: boolean;
}

export interface CacheStats {
  exactHits: number;
  semanticHits: number;
  embeddingHits: number;
  misses: number;
  totalRequests: number;
  hitRate: number;
  estimatedSavingsUsd: number;
}

export type CacheLayer = "exact" | "semantic" | "embedding" | "miss";

export interface CacheLookupResult {
  hit: boolean;
  layer: CacheLayer;
  value: string | null;
  latencyMs: number;
}

// ── Default Config ────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: CacheConfig = {
  exactTtl: 300,          // 5 minutes for identical queries
  semanticTtl: 600,       // 10 minutes for similar queries
  embeddingTtl: 86400,    // 24 hours for embeddings (stable)
  semanticThreshold: 0.92, // 92% similarity for semantic hit
  useRedis: true,
};

// ── Cache Key Generation ──────────────────────────────────────────────────────

/**
 * Generate a deterministic cache key from request parameters.
 * Includes userId to prevent cross-user leaks.
 */
export function generateCacheKey(params: {
  messages: string;
  model?: string;
  userId?: string;
  feature?: string;
}): string {
  const raw = [
    params.userId ?? "anon",
    params.feature ?? "default",
    params.model ?? "default",
    params.messages,
  ].join("|");

  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

/**
 * Generate a key for embedding cache.
 * Pure content hash — embeddings are deterministic for the same input.
 */
export function generateEmbeddingKey(text: string): string {
  return "emb:" + createHash("sha256").update(text).digest("hex").slice(0, 32);
}

// ── Layer 1: Exact Match Cache ────────────────────────────────────────────────

/**
 * Check if an identical request was recently answered.
 * Uses Redis with SHA-256 key for O(1) lookup.
 */
export async function exactLookup(key: string): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return localExactGet(key);

  try {
    return await redis.get<string>(`cache:exact:${key}`);
  } catch {
    return localExactGet(key);
  }
}

export async function exactStore(key: string, value: string, ttl?: number): Promise<void> {
  const redis = getRedis();
  const expiry = ttl ?? DEFAULT_CONFIG.exactTtl;

  if (redis) {
    try {
      await redis.set(`cache:exact:${key}`, value, { ex: expiry });
    } catch {
      localExactSet(key, value, expiry);
    }
  } else {
    localExactSet(key, value, expiry);
  }
}

// ── Layer 2: Semantic Cache ───────────────────────────────────────────────────

/**
 * Check if a semantically similar question was recently answered.
 *
 * Instead of exact string match, compares the query embedding against
 * cached query embeddings. If similarity > threshold, returns the cached response.
 *
 * This catches: "What is WCAG 1.4.3?" vs "Explain WCAG criterion 1.4.3"
 * (different words, same intent, same answer).
 */
export async function semanticLookup(
  queryEmbedding: number[],
  userId: string,
  threshold?: number,
): Promise<{ response: string; similarity: number } | null> {
  const redis = getRedis();
  if (!redis) return localSemanticLookup(queryEmbedding, userId, threshold);

  const minSimilarity = threshold ?? DEFAULT_CONFIG.semanticThreshold;

  try {
    // Get all cached entries for this user (capped at 50)
    const keys = await redis.keys(`cache:semantic:${userId}:*`);
    if (keys.length === 0) return null;

    // Check each cached embedding for similarity
    // In production, this would use Redis vector search (RediSearch module)
    // For now, fetch and compare in-memory (acceptable for <50 entries)
    let bestMatch: { response: string; similarity: number } | null = null;

    for (const key of keys.slice(0, 50)) {
      const entry = await redis.get<{ embedding: number[]; response: string }>(key);
      if (!entry) continue;

      const similarity = cosineSimilarity(queryEmbedding, entry.embedding);
      if (similarity >= minSimilarity && (!bestMatch || similarity > bestMatch.similarity)) {
        bestMatch = { response: entry.response, similarity };
      }
    }

    return bestMatch;
  } catch {
    return localSemanticLookup(queryEmbedding, userId, threshold);
  }
}

export async function semanticStore(
  key: string,
  embedding: number[],
  response: string,
  userId: string,
  ttl?: number,
): Promise<void> {
  const redis = getRedis();
  const expiry = ttl ?? DEFAULT_CONFIG.semanticTtl;

  const entry = { embedding, response };

  if (redis) {
    try {
      await redis.set(`cache:semantic:${userId}:${key}`, entry, { ex: expiry });
    } catch {
      localSemanticStore(key, embedding, response, userId, expiry);
    }
  } else {
    localSemanticStore(key, embedding, response, userId, expiry);
  }
}

// ── Layer 3: Prompt Cache (Provider-Level) ────────────────────────────────────

/**
 * Build prompt cache configuration for providers that support it.
 *
 * Anthropic: Marks the system prompt as cacheable — shared prefix across
 * all requests means the provider doesn't re-process it each time.
 * Saves ~90% of system prompt input tokens on cache hits.
 *
 * OpenAI: Automatic prompt caching for prompts >1024 tokens with shared prefix.
 */
export interface PromptCacheHint {
  /** Mark system message as cacheable (Anthropic) */
  cacheSystemPrompt: boolean;
  /** Estimated savings if system prompt is cached */
  estimatedSavingPct: number;
  /** Provider-specific cache control headers */
  cacheControl?: { type: "ephemeral" };
}

export function getPromptCacheHint(provider: string, systemPromptTokens: number): PromptCacheHint {
  if (provider === "anthropic" && systemPromptTokens > 100) {
    return {
      cacheSystemPrompt: true,
      estimatedSavingPct: 90,
      cacheControl: { type: "ephemeral" },
    };
  }

  if (provider === "openai" && systemPromptTokens > 1024) {
    return {
      cacheSystemPrompt: true,
      estimatedSavingPct: 50, // OpenAI auto-caches, less explicit control
    };
  }

  return { cacheSystemPrompt: false, estimatedSavingPct: 0 };
}

// ── Layer 4: Embedding Cache ──────────────────────────────────────────────────

/**
 * Cache embedding results to avoid redundant API calls.
 *
 * Embeddings are DETERMINISTIC — same text always produces same vector.
 * No reason to call the API twice for the same input.
 * Saves: ~$0.00002 per cached hit × thousands of repeated texts = meaningful.
 */
export async function embeddingLookup(text: string): Promise<number[] | null> {
  const key = generateEmbeddingKey(text);
  const redis = getRedis();

  if (redis) {
    try {
      return await redis.get<number[]>(`cache:embed:${key}`);
    } catch {
      return localEmbeddingGet(key);
    }
  }
  return localEmbeddingGet(key);
}

export async function embeddingStore(text: string, embedding: number[], ttl?: number): Promise<void> {
  const key = generateEmbeddingKey(text);
  const redis = getRedis();
  const expiry = ttl ?? DEFAULT_CONFIG.embeddingTtl;

  if (redis) {
    try {
      await redis.set(`cache:embed:${key}`, embedding, { ex: expiry });
    } catch {
      localEmbeddingSet(key, embedding, expiry);
    }
  } else {
    localEmbeddingSet(key, embedding, expiry);
  }
}

// ── Unified Cache Lookup ──────────────────────────────────────────────────────

/**
 * Multi-layer cache lookup. Checks each layer in order, returns on first hit.
 * Returns which layer hit (for metrics/observability).
 */
export async function cacheLookup(params: {
  messages: string;
  model?: string;
  userId: string;
  feature?: string;
  queryEmbedding?: number[];
}): Promise<CacheLookupResult> {
  const start = Date.now();

  // Layer 1: Exact match
  const key = generateCacheKey(params);
  const exact = await exactLookup(key);
  if (exact) {
    return { hit: true, layer: "exact", value: exact, latencyMs: Date.now() - start };
  }

  // Layer 2: Semantic similarity (requires embedding)
  if (params.queryEmbedding) {
    const semantic = await semanticLookup(params.queryEmbedding, params.userId);
    if (semantic) {
      return { hit: true, layer: "semantic", value: semantic.response, latencyMs: Date.now() - start };
    }
  }

  return { hit: false, layer: "miss", value: null, latencyMs: Date.now() - start };
}

/**
 * Store a response in all applicable cache layers.
 */
export async function cacheStore(params: {
  messages: string;
  model?: string;
  userId: string;
  feature?: string;
  response: string;
  queryEmbedding?: number[];
}): Promise<void> {
  const key = generateCacheKey(params);

  // Store in exact cache
  await exactStore(key, params.response);

  // Store in semantic cache (if we have the embedding)
  if (params.queryEmbedding) {
    await semanticStore(key, params.queryEmbedding, params.response, params.userId);
  }
}

// ── Cache Invalidation ────────────────────────────────────────────────────────

/**
 * Invalidate all cache entries for a user (e.g., after new scan data arrives).
 * New data means cached answers may be stale.
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    localClear(userId);
    return;
  }

  try {
    // Clear semantic cache for this user
    const keys = await redis.keys(`cache:semantic:${userId}:*`);
    if (keys.length > 0) {
      await Promise.all(keys.map((k) => redis.del(k)));
    }
  } catch {
    localClear(userId);
  }
}

/**
 * Invalidate all cache entries for a workspace (e.g., after bulk scan).
 */
export async function invalidateWorkspaceCache(workspaceId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    const keys = await redis.keys(`cache:*:${workspaceId}:*`);
    if (keys.length > 0) {
      await Promise.all(keys.map((k) => redis.del(k)));
    }
  } catch {
    // Best effort
  }
}

// ── Cache Metrics ─────────────────────────────────────────────────────────────

const metrics = { exactHits: 0, semanticHits: 0, embeddingHits: 0, misses: 0 };

export function recordCacheMetric(layer: CacheLayer): void {
  if (layer === "exact") metrics.exactHits++;
  else if (layer === "semantic") metrics.semanticHits++;
  else if (layer === "embedding") metrics.embeddingHits++;
  else metrics.misses++;
}

export function getCacheStats(): CacheStats {
  const total = metrics.exactHits + metrics.semanticHits + metrics.embeddingHits + metrics.misses;
  const hits = metrics.exactHits + metrics.semanticHits + metrics.embeddingHits;
  const avgCostPerCall = 0.0005; // $0.0005 average LLM call cost

  return {
    ...metrics,
    totalRequests: total,
    hitRate: total > 0 ? hits / total : 0,
    estimatedSavingsUsd: hits * avgCostPerCall,
  };
}

// ── Math Helpers ──────────────────────────────────────────────────────────────

/**
 * Cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ── In-Memory Fallback (dev / no Redis) ───────────────────────────────────────

const localExact = new Map<string, { value: string; expiresAt: number }>();
const localSemantic = new Map<string, { embedding: number[]; response: string; expiresAt: number }>();
const localEmbeddings = new Map<string, { embedding: number[]; expiresAt: number }>();

function localExactGet(key: string): string | null {
  const entry = localExact.get(key);
  if (!entry || Date.now() > entry.expiresAt) { localExact.delete(key); return null; }
  return entry.value;
}

function localExactSet(key: string, value: string, ttlSec: number): void {
  if (localExact.size > 200) { const first = localExact.keys().next().value; if (first) localExact.delete(first); }
  localExact.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}

function localSemanticLookup(queryEmbedding: number[], userId: string, threshold?: number): { response: string; similarity: number } | null {
  const minSim = threshold ?? DEFAULT_CONFIG.semanticThreshold;
  let best: { response: string; similarity: number } | null = null;

  for (const [key, entry] of localSemantic) {
    if (!key.includes(userId)) continue;
    if (Date.now() > entry.expiresAt) { localSemantic.delete(key); continue; }
    const sim = cosineSimilarity(queryEmbedding, entry.embedding);
    if (sim >= minSim && (!best || sim > best.similarity)) {
      best = { response: entry.response, similarity: sim };
    }
  }
  return best;
}

function localSemanticStore(key: string, embedding: number[], response: string, userId: string, ttlSec: number): void {
  if (localSemantic.size > 100) { const first = localSemantic.keys().next().value; if (first) localSemantic.delete(first); }
  localSemantic.set(`${userId}:${key}`, { embedding, response, expiresAt: Date.now() + ttlSec * 1000 });
}

function localEmbeddingGet(key: string): number[] | null {
  const entry = localEmbeddings.get(key);
  if (!entry || Date.now() > entry.expiresAt) { localEmbeddings.delete(key); return null; }
  return entry.embedding;
}

function localEmbeddingSet(key: string, embedding: number[], ttlSec: number): void {
  if (localEmbeddings.size > 500) { const first = localEmbeddings.keys().next().value; if (first) localEmbeddings.delete(first); }
  localEmbeddings.set(key, { embedding, expiresAt: Date.now() + ttlSec * 1000 });
}

function localClear(userId: string): void {
  for (const key of localSemantic.keys()) {
    if (key.startsWith(userId)) localSemantic.delete(key);
  }
}
