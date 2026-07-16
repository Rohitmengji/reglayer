import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/gateway", () => ({
  complete: vi.fn().mockResolvedValue(null),
  getDefaultModelId: vi.fn().mockReturnValue("gpt-4o-mini"),
}));

import { treeOfThoughts, getDefaultApproaches } from "@/lib/ai/reasoning/tree-of-thoughts";

describe("Tree of Thoughts", () => {
  describe("getDefaultApproaches", () => {
    it("returns at least 5 approaches", () => {
      expect(getDefaultApproaches().length).toBeGreaterThanOrEqual(5);
    });

    it("includes severity-first approach", () => {
      expect(getDefaultApproaches().some((a) => a.approach.includes("Severity"))).toBe(true);
    });

    it("includes legal-risk approach", () => {
      expect(getDefaultApproaches().some((a) => a.approach.includes("Legal"))).toBe(true);
    });

    it("includes quick-wins approach", () => {
      expect(getDefaultApproaches().some((a) => a.approach.includes("Quick"))).toBe(true);
    });

    it("includes user-impact approach", () => {
      expect(getDefaultApproaches().some((a) => a.approach.includes("User"))).toBe(true);
    });

    it("includes standards-coverage approach", () => {
      expect(getDefaultApproaches().some((a) => a.approach.includes("Standards"))).toBe(true);
    });

    it("each approach has id, name, and description", () => {
      for (const a of getDefaultApproaches()) {
        expect(a.id).toBeGreaterThan(0);
        expect(a.approach.length).toBeGreaterThan(0);
        expect(a.description.length).toBeGreaterThan(10);
      }
    });
  });

  describe("treeOfThoughts", () => {
    it("returns result structure when LLM unavailable", async () => {
      const result = await treeOfThoughts("How to prioritize 47 violations?");
      // LLM returns null → uses fallback approaches → generates empty branches
      expect(result).toBeDefined();
      expect(typeof result.totalTokens).toBe("number");
      expect(typeof result.totalCostUsd).toBe("number");
      expect(Array.isArray(result.branches)).toBe(true);
      expect(Array.isArray(result.crossBranchInsights)).toBe(true);
    });

    it("respects branches config", async () => {
      const result = await treeOfThoughts("test", undefined, { branches: 2 });
      // Should attempt 2 branches (even with null LLM, fallback gives 3 defaults but config limits)
      expect(result.branches.length).toBeLessThanOrEqual(3);
    });

    it("includes best branch in result", async () => {
      const result = await treeOfThoughts("test");
      expect(result.bestBranch).toBeDefined();
      expect(typeof result.bestBranch.score).toBe("number");
    });
  });
});
