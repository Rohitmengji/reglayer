/**
 * Tests for Multi-Layer Context Cache
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/cache/redis", () => ({ getRedis: () => null })); // force in-memory

import {
  generateCacheKey,
  generateEmbeddingKey,
  exactLookup,
  exactStore,
  embeddingLookup,
  embeddingStore,
  cacheLookup,
  cacheStore,
  cosineSimilarity,
  getPromptCacheHint,
  recordCacheMetric,
  getCacheStats,
  invalidateUserCache,
} from "@/lib/ai/cache/context-cache";

describe("Multi-Layer Context Cache", () => {
  // ── Key Generation ──────────────────────────────────────────────────────

  describe("generateCacheKey", () => {
    it("produces deterministic keys for same input", () => {
      const key1 = generateCacheKey({ messages: "hello", userId: "u1", feature: "chat" });
      const key2 = generateCacheKey({ messages: "hello", userId: "u1", feature: "chat" });
      expect(key1).toBe(key2);
    });

    it("produces different keys for different users", () => {
      const key1 = generateCacheKey({ messages: "hello", userId: "u1" });
      const key2 = generateCacheKey({ messages: "hello", userId: "u2" });
      expect(key1).not.toBe(key2);
    });

    it("produces different keys for different messages", () => {
      const key1 = generateCacheKey({ messages: "hello", userId: "u1" });
      const key2 = generateCacheKey({ messages: "goodbye", userId: "u1" });
      expect(key1).not.toBe(key2);
    });

    it("key is 32 chars (truncated sha256)", () => {
      const key = generateCacheKey({ messages: "test", userId: "u1" });
      expect(key).toHaveLength(32);
    });
  });

  describe("generateEmbeddingKey", () => {
    it("is deterministic", () => {
      expect(generateEmbeddingKey("test")).toBe(generateEmbeddingKey("test"));
    });

    it("prefixed with emb:", () => {
      expect(generateEmbeddingKey("test").startsWith("emb:")).toBe(true);
    });
  });

  // ── Exact Cache (in-memory fallback) ────────────────────────────────────

  describe("exactLookup + exactStore", () => {
    it("returns null for unknown keys", async () => {
      const result = await exactLookup("nonexistent-key-xyz");
      expect(result).toBeNull();
    });

    it("stores and retrieves values", async () => {
      await exactStore("test-key-1", "cached response");
      const result = await exactLookup("test-key-1");
      expect(result).toBe("cached response");
    });
  });

  // ── Embedding Cache ─────────────────────────────────────────────────────

  describe("embeddingLookup + embeddingStore", () => {
    it("returns null for uncached text", async () => {
      const result = await embeddingLookup("never seen before text xyz");
      expect(result).toBeNull();
    });

    it("stores and retrieves embeddings", async () => {
      const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];
      await embeddingStore("cached text", embedding);
      const result = await embeddingLookup("cached text");
      expect(result).toEqual(embedding);
    });
  });

  // ── Cosine Similarity ───────────────────────────────────────────────────

  describe("cosineSimilarity", () => {
    it("returns 1.0 for identical vectors", () => {
      expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
    });

    it("returns 0.0 for orthogonal vectors", () => {
      expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0);
    });

    it("returns -1.0 for opposite vectors", () => {
      expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1.0);
    });

    it("handles empty vectors", () => {
      expect(cosineSimilarity([], [])).toBe(0);
    });

    it("handles mismatched lengths", () => {
      expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    });
  });

  // ── Prompt Cache Hints ──────────────────────────────────────────────────

  describe("getPromptCacheHint", () => {
    it("enables cache for Anthropic with long system prompt", () => {
      const hint = getPromptCacheHint("anthropic", 500);
      expect(hint.cacheSystemPrompt).toBe(true);
      expect(hint.estimatedSavingPct).toBe(90);
      expect(hint.cacheControl).toEqual({ type: "ephemeral" });
    });

    it("enables cache for OpenAI with >1024 token prompt", () => {
      const hint = getPromptCacheHint("openai", 2000);
      expect(hint.cacheSystemPrompt).toBe(true);
      expect(hint.estimatedSavingPct).toBe(50);
    });

    it("disables cache for short prompts", () => {
      const hint = getPromptCacheHint("anthropic", 50);
      expect(hint.cacheSystemPrompt).toBe(false);
    });

    it("disables cache for unknown providers", () => {
      const hint = getPromptCacheHint("gemini", 5000);
      expect(hint.cacheSystemPrompt).toBe(false);
    });
  });

  // ── Unified Cache Lookup ────────────────────────────────────────────────

  describe("cacheLookup + cacheStore", () => {
    it("returns miss for fresh queries", async () => {
      const result = await cacheLookup({
        messages: "unique query " + Date.now(),
        userId: "user-test",
      });
      expect(result.hit).toBe(false);
      expect(result.layer).toBe("miss");
    });

    it("returns exact hit after store", async () => {
      const params = {
        messages: "cached query test",
        userId: "user-cache-test",
        feature: "chat",
      };

      await cacheStore({ ...params, response: "cached answer" });
      const result = await cacheLookup(params);
      expect(result.hit).toBe(true);
      expect(result.layer).toBe("exact");
      expect(result.value).toBe("cached answer");
    });
  });

  // ── Cache Metrics ───────────────────────────────────────────────────────

  describe("getCacheStats", () => {
    it("tracks metrics", () => {
      recordCacheMetric("exact");
      recordCacheMetric("exact");
      recordCacheMetric("miss");
      const stats = getCacheStats();
      expect(stats.exactHits).toBeGreaterThanOrEqual(2);
      expect(stats.misses).toBeGreaterThanOrEqual(1);
      expect(stats.hitRate).toBeGreaterThan(0);
    });
  });

  // ── Cache Invalidation ──────────────────────────────────────────────────

  describe("invalidateUserCache", () => {
    it("does not throw", async () => {
      await expect(invalidateUserCache("user-123")).resolves.toBeUndefined();
    });
  });
});
