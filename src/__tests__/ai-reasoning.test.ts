import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/gateway", () => ({
  complete: vi.fn().mockResolvedValue(null),
  getDefaultModelId: vi.fn().mockReturnValue("gpt-4o-mini"),
}));

import { debate } from "@/lib/ai/reasoning/debate";
import { monteCarloReason, calculateConfidence } from "@/lib/ai/reasoning/montecarlo";

describe("Debate Mode", () => {
  it("returns graceful result when LLM unavailable", async () => {
    const result = await debate("Is our site ADA compliant?");
    expect(result.answer).toBeTruthy();
    expect(result.winner).toBe("balanced");
    expect(result.transcript).toBeDefined();
    expect(typeof result.totalTokens).toBe("number");
    expect(typeof result.totalCostUsd).toBe("number");
  });

  it("respects rounds config", async () => {
    const result = await debate("test", undefined, { rounds: 1 });
    // With null LLM, transcript has turns for each round
    expect(result.transcript.length).toBeLessThanOrEqual(4); // A + B per round + judge
  });

  it("includes confidence score", async () => {
    const result = await debate("test");
    expect(typeof result.confidence).toBe("number");
  });
});

describe("Monte Carlo Reasoning", () => {
  it("returns empty result when LLM unavailable", async () => {
    const result = await monteCarloReason("system", "query");
    expect(result.bestResponse).toBe("");
    expect(result.candidates).toHaveLength(0);
  });

  describe("calculateConfidence", () => {
    it("returns 1 for single score", () => {
      expect(calculateConfidence([8])).toBe(1);
    });

    it("returns high confidence for consistent scores", () => {
      const c = calculateConfidence([8, 8, 8, 8, 8]);
      expect(c).toBeGreaterThan(0.95);
    });

    it("returns lower confidence for varied scores", () => {
      const c = calculateConfidence([2, 5, 8, 3, 9]);
      expect(c).toBeLessThan(0.7);
    });

    it("returns low confidence for extreme variance", () => {
      const c = calculateConfidence([1, 10, 1, 10, 1]);
      expect(c).toBeLessThan(0.5);
    });

    it("returns value between 0 and 1", () => {
      const c = calculateConfidence([3, 7, 5, 6, 4]);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    });
  });
});
