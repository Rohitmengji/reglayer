/**
 * Tests for Hybrid Search Engine — query rewriting and RRF fusion
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/ai/gateway", () => ({ embed: vi.fn(), complete: vi.fn() }));

import { rewriteQuery } from "@/lib/ai/search/hybrid";

describe("Hybrid Search Engine", () => {
  describe("rewriteQuery", () => {
    it("expands color contrast query with WCAG references", () => {
      const result = rewriteQuery("color contrast issues");
      expect(result.dense).toContain("WCAG 1.4.3");
      expect(result.dense).toContain("readability");
    });

    it("expands alt text query", () => {
      const result = rewriteQuery("missing alt text on images");
      expect(result.dense).toContain("WCAG 1.1.1");
      expect(result.dense).toContain("alternative text");
    });

    it("expands keyboard navigation query", () => {
      const result = rewriteQuery("keyboard navigation broken");
      expect(result.dense).toContain("WCAG 2.1.1");
      expect(result.dense).toContain("tab order");
    });

    it("expands ARIA query", () => {
      const result = rewriteQuery("aria labels missing");
      expect(result.dense).toContain("WAI-ARIA");
      expect(result.dense).toContain("roles");
    });

    it("expands heading query", () => {
      const result = rewriteQuery("heading structure wrong");
      expect(result.dense).toContain("hierarchy");
      expect(result.dense).toContain("WCAG 1.3.1");
    });

    it("expands form accessibility query", () => {
      const result = rewriteQuery("form labels not accessible");
      expect(result.dense).toContain("accessible name");
    });

    it("strips stop words from sparse query", () => {
      const result = rewriteQuery("what are the color contrast violations in my site");
      expect(result.sparse).not.toContain("what");
      expect(result.sparse).not.toContain("the");
      expect(result.sparse).not.toContain("are");
      expect(result.sparse).toContain("color");
      expect(result.sparse).toContain("contrast");
      expect(result.sparse).toContain("violations");
    });

    it("handles short queries without expansion", () => {
      const result = rewriteQuery("WCAG");
      expect(result.dense).toBe("WCAG");
      // sparse should fall back to original
      expect(result.sparse).toContain("WCAG");
    });

    it("handles empty query", () => {
      const result = rewriteQuery("");
      expect(result.dense).toBe("");
      expect(result.sparse).toBe("");
    });

    it("preserves original query in dense when no expansion matches", () => {
      const result = rewriteQuery("how to fix my website compliance status");
      expect(result.dense).toBe("how to fix my website compliance status");
    });

    it("returns sparse terms without filler words", () => {
      const result = rewriteQuery("show me all critical violations from last scan");
      expect(result.sparse).toContain("critical");
      expect(result.sparse).toContain("violations");
      expect(result.sparse).toContain("last");
      expect(result.sparse).toContain("scan");
      expect(result.sparse).not.toContain("show");
      expect(result.sparse).not.toContain("me");
    });
  });
});
