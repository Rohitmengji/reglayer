import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/gateway", () => ({
  complete: vi.fn().mockResolvedValue(null),
  getDefaultModelId: vi.fn().mockReturnValue("gpt-4o-mini"),
}));

import { getCritiqueDimensions, reflect } from "@/lib/ai/reflection/engine";

describe("Self-Reflection Engine", () => {
  describe("getCritiqueDimensions", () => {
    it("returns 6 dimensions", () => {
      expect(getCritiqueDimensions()).toHaveLength(6);
    });

    it("includes accuracy", () => {
      expect(getCritiqueDimensions().some((d) => d.id === "accuracy")).toBe(true);
    });

    it("includes completeness", () => {
      expect(getCritiqueDimensions().some((d) => d.id === "completeness")).toBe(true);
    });

    it("includes groundedness", () => {
      expect(getCritiqueDimensions().some((d) => d.id === "groundedness")).toBe(true);
    });

    it("includes relevance", () => {
      expect(getCritiqueDimensions().some((d) => d.id === "relevance")).toBe(true);
    });

    it("includes specificity", () => {
      expect(getCritiqueDimensions().some((d) => d.id === "specificity")).toBe(true);
    });

    it("includes actionability", () => {
      expect(getCritiqueDimensions().some((d) => d.id === "actionability")).toBe(true);
    });

    it("each dimension has a description", () => {
      for (const d of getCritiqueDimensions()) {
        expect(d.description.length).toBeGreaterThan(10);
      }
    });
  });

  describe("reflect", () => {
    it("returns original response when LLM is unavailable", async () => {
      const result = await reflect("original answer", "what is WCAG?");
      // complete() returns null (mocked), so should fall back gracefully
      expect(result.response).toBe("original answer");
      expect(result.rounds).toBeLessThanOrEqual(2);
    });

    it("tracks reflection tokens and cost", async () => {
      const result = await reflect("test response", "test query");
      expect(typeof result.reflectionTokens).toBe("number");
      expect(typeof result.reflectionCostUsd).toBe("number");
    });

    it("respects maxRounds config", async () => {
      const result = await reflect("test", "query", undefined, { maxRounds: 1 });
      expect(result.rounds).toBeLessThanOrEqual(1);
    });
  });
});
