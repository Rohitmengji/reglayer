/**
 * Tests for Context Compression Engine
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  compressContext,
  scoreRelevance,
  scoreChunks,
  deduplicateChunks,
  estimateTokens,
  buildDistillationPrompt,
  type ContextChunk,
} from "@/lib/ai/compression/engine";

describe("Context Compression Engine", () => {
  // ── Token Estimation ────────────────────────────────────────────────────

  describe("estimateTokens", () => {
    it("estimates ~1 token per 4 chars", () => {
      expect(estimateTokens("hello world")).toBe(3); // 11 chars / 4 = 2.75 → 3
    });

    it("handles empty string", () => {
      expect(estimateTokens("")).toBe(0);
    });
  });

  // ── Relevance Scoring ───────────────────────────────────────────────────

  describe("scoreRelevance", () => {
    it("scores highly when query terms appear in chunk", () => {
      const score = scoreRelevance(
        "The color contrast ratio must be at least 4.5:1 for normal text per WCAG 1.4.3",
        "color contrast"
      );
      expect(score).toBeGreaterThan(0.5);
    });

    it("scores low when no term overlap", () => {
      const score = scoreRelevance(
        "The heading structure should follow a logical order",
        "color contrast ratio"
      );
      expect(score).toBeLessThan(0.4);
    });

    it("gives bonus for exact phrase match", () => {
      const withPhrase = scoreRelevance("fix the color contrast issue", "color contrast");
      const withoutPhrase = scoreRelevance("color issues with contrast ratios", "color contrast");
      expect(withPhrase).toBeGreaterThanOrEqual(withoutPhrase);
    });

    it("returns neutral score for empty query", () => {
      expect(scoreRelevance("some content", "")).toBe(0.5);
    });
  });

  // ── Deduplication ───────────────────────────────────────────────────────

  describe("deduplicateChunks", () => {
    it("removes near-duplicate chunks", () => {
      const chunks: ContextChunk[] = [
        { id: "1", content: "Color contrast must be 4.5:1 for normal text", source: "violations", relevanceScore: 0.9, tokenCount: 10 },
        { id: "2", content: "Color contrast must be 4.5:1 for normal sized text", source: "knowledge", relevanceScore: 0.8, tokenCount: 11 },
        { id: "3", content: "Keyboard navigation requires visible focus indicators", source: "violations", relevanceScore: 0.7, tokenCount: 8 },
      ];
      const deduped = deduplicateChunks(chunks);
      expect(deduped.length).toBeLessThan(3);
      // Should keep the keyboard chunk (unique)
      expect(deduped.some((c) => c.id === "3")).toBe(true);
    });

    it("keeps all chunks when they are unique", () => {
      const chunks: ContextChunk[] = [
        { id: "1", content: "Color contrast requires 4.5:1 ratio for text", source: "v", relevanceScore: 0.9, tokenCount: 10 },
        { id: "2", content: "Keyboard focus must be visible at all times", source: "v", relevanceScore: 0.8, tokenCount: 10 },
        { id: "3", content: "Images need descriptive alt text for screen readers", source: "v", relevanceScore: 0.7, tokenCount: 10 },
      ];
      const deduped = deduplicateChunks(chunks);
      expect(deduped).toHaveLength(3);
    });

    it("handles empty input", () => {
      expect(deduplicateChunks([])).toHaveLength(0);
    });
  });

  // ── Full Compression Pipeline ───────────────────────────────────────────

  describe("compressContext", () => {
    const makeChunk = (id: string, content: string, score: number): ContextChunk => ({
      id,
      content,
      source: "violations",
      relevanceScore: score,
      tokenCount: estimateTokens(content),
    });

    it("returns as-is when under budget", () => {
      const chunks = [makeChunk("1", "short content", 0.9)];
      const result = compressContext(chunks, { tokenBudget: 1000, query: "test" });
      expect(result.ratio).toBe(1.0);
      expect(result.strategies).toContain("no-op (under budget)");
    });

    it("filters low-relevance chunks", () => {
      const chunks = [
        makeChunk("1", "A".repeat(400), 0.9),
        makeChunk("2", "B".repeat(400), 0.1), // below threshold
        makeChunk("3", "C".repeat(400), 0.8),
      ];
      const result = compressContext(chunks, {
        tokenBudget: 50, // force compression
        query: "test",
        minRelevance: 0.3,
      });
      expect(result.chunksIncluded).toBeLessThanOrEqual(2);
    });

    it("respects token budget", () => {
      const chunks = Array.from({ length: 20 }, (_, i) =>
        makeChunk(`${i}`, `Chunk ${i} with enough content to use tokens. `.repeat(5), 0.5 + i * 0.02)
      );
      const result = compressContext(chunks, { tokenBudget: 200, query: "test" });
      expect(result.tokenCount).toBeLessThanOrEqual(200);
    });

    it("handles empty input", () => {
      const result = compressContext([], { tokenBudget: 1000, query: "test" });
      expect(result.compressed).toBe("");
      expect(result.chunksIncluded).toBe(0);
    });

    it("prioritizes high-relevance chunks", () => {
      const chunks = [
        makeChunk("low", "Low relevance content about heading structure", 0.3),
        makeChunk("high", "High relevance: color contrast WCAG 1.4.3", 0.95),
        makeChunk("mid", "Medium relevance about accessibility testing", 0.6),
      ];
      const result = compressContext(chunks, { tokenBudget: 30, query: "color contrast" });
      // The high-relevance chunk should definitely be included
      expect(result.compressed).toContain("color contrast");
    });

    it("reports compression strategies applied", () => {
      const chunks = Array.from({ length: 10 }, (_, i) =>
        makeChunk(`${i}`, `Content chunk ${i}. `.repeat(20), 0.5 + i * 0.05)
      );
      const result = compressContext(chunks, { tokenBudget: 100, query: "test" });
      expect(result.strategies.length).toBeGreaterThan(0);
      expect(result.strategies.some((s) => s.includes("budget-allocation"))).toBe(true);
    });
  });

  // ── Score Chunks ────────────────────────────────────────────────────────

  describe("scoreChunks", () => {
    it("preserves pre-existing scores", () => {
      const chunks: ContextChunk[] = [
        { id: "1", content: "test", source: "v", relevanceScore: 0.95, tokenCount: 1 },
      ];
      const scored = scoreChunks(chunks, "anything");
      expect(scored[0].relevanceScore).toBe(0.95);
    });

    it("scores unscored chunks (relevanceScore = 0)", () => {
      const chunks: ContextChunk[] = [
        { id: "1", content: "color contrast accessibility", source: "v", relevanceScore: 0, tokenCount: 5 },
      ];
      const scored = scoreChunks(chunks, "color contrast");
      expect(scored[0].relevanceScore).toBeGreaterThan(0);
    });
  });

  // ── Distillation Prompt ─────────────────────────────────────────────────

  describe("buildDistillationPrompt", () => {
    it("includes query and chunk content", () => {
      const chunks: ContextChunk[] = [
        { id: "1", content: "WCAG 1.4.3 requires 4.5:1 contrast", source: "regs", relevanceScore: 0.9, tokenCount: 8 },
      ];
      const prompt = buildDistillationPrompt(chunks, "contrast requirements");
      expect(prompt).toContain("contrast requirements");
      expect(prompt).toContain("WCAG 1.4.3");
      expect(prompt).toContain("Distill");
    });

    it("caps at 20 chunks", () => {
      const chunks = Array.from({ length: 30 }, (_, i) => ({
        id: `${i}`, content: `chunk ${i}`, source: "v", relevanceScore: 0.5, tokenCount: 2,
      }));
      const prompt = buildDistillationPrompt(chunks, "test");
      // Should only include [1] through [20], not [21]-[30]
      expect(prompt).toContain("[20]");
      expect(prompt).not.toContain("[21]");
    });
  });
});
