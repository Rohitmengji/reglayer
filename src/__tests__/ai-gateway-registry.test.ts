/**
 * RegLayer — AI Gateway Registry & Cost Calculation Tests
 *
 * WHY: Cost calculations drive billing and the AI cost dashboard.
 *      Incorrect math means wrong data shown to users.
 * WHAT: Tests model config lookup, cost calculation, default model selection,
 *       embedding cost calculation.
 * HOW: Unit tests — pure functions, no mocks needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getModelConfig,
  calculateCost,
  getDefaultModel,
  getAvailableModels,
  calculateEmbeddingCost,
  getEmbeddingConfig,
} from "@/lib/ai/gateway/providers/registry";

describe("AI Gateway Registry", () => {
  describe("getModelConfig", () => {
    it("returns config for gpt-4o-mini", () => {
      const config = getModelConfig("gpt-4o-mini");
      expect(config.id).toBe("gpt-4o-mini");
      expect(config.provider).toBe("openai");
      expect(config.pricing.inputPerMillion).toBe(0.15);
      expect(config.pricing.outputPerMillion).toBe(0.60);
      expect(config.supportsVision).toBe(true);
    });

    it("returns config for claude-haiku", () => {
      const config = getModelConfig("claude-haiku");
      expect(config.id).toBe("claude-haiku");
      expect(config.provider).toBe("anthropic");
      expect(config.pricing.inputPerMillion).toBe(0.80);
      expect(config.pricing.outputPerMillion).toBe(4.00);
    });

    it("returns config for claude-sonnet", () => {
      const config = getModelConfig("claude-sonnet");
      expect(config.provider).toBe("anthropic");
      expect(config.pricing.inputPerMillion).toBe(3.00);
      expect(config.pricing.outputPerMillion).toBe(15.00);
    });

    it("throws for unknown model ID", () => {
      expect(() => getModelConfig("nonexistent-model" as never)).toThrow(
        /Unknown model/,
      );
    });
  });

  describe("calculateCost", () => {
    it("calculates cost for gpt-4o-mini correctly", () => {
      // 1000 input tokens, 500 output tokens
      const result = calculateCost("gpt-4o-mini", 1000, 500);
      // input: 1000 * 0.15 / 1,000,000 = 0.00015
      // output: 500 * 0.60 / 1,000,000 = 0.0003
      expect(result.inputCost).toBeCloseTo(0.00015, 6);
      expect(result.outputCost).toBeCloseTo(0.0003, 6);
      expect(result.totalCost).toBeCloseTo(0.00045, 6);
    });

    it("calculates cost for claude-opus (expensive model)", () => {
      const result = calculateCost("claude-opus", 10_000, 5_000);
      // input: 10000 * 15.00 / 1,000,000 = 0.15
      // output: 5000 * 75.00 / 1,000,000 = 0.375
      expect(result.inputCost).toBeCloseTo(0.15, 4);
      expect(result.outputCost).toBeCloseTo(0.375, 4);
      expect(result.totalCost).toBeCloseTo(0.525, 4);
    });

    it("returns zero cost for zero tokens", () => {
      const result = calculateCost("gpt-4o-mini", 0, 0);
      expect(result.totalCost).toBe(0);
    });

    it("handles large token counts (1M tokens)", () => {
      const result = calculateCost("gpt-4o-mini", 1_000_000, 1_000_000);
      // input: 1M * 0.15 / 1M = 0.15
      // output: 1M * 0.60 / 1M = 0.60
      expect(result.inputCost).toBeCloseTo(0.15, 4);
      expect(result.outputCost).toBeCloseTo(0.60, 4);
      expect(result.totalCost).toBeCloseTo(0.75, 4);
    });
  });

  describe("calculateEmbeddingCost", () => {
    it("calculates cost for text-embedding-3-small", () => {
      const result = calculateEmbeddingCost("text-embedding-3-small", 1_000);
      // 1000 * 0.02 / 1,000,000 = 0.00002
      expect(result.totalCost).toBeCloseTo(0.00002, 8);
      expect(result.outputCost).toBe(0);
    });

    it("calculates cost for text-embedding-3-large", () => {
      const result = calculateEmbeddingCost("text-embedding-3-large", 500_000);
      // 500000 * 0.13 / 1,000,000 = 0.065
      expect(result.totalCost).toBeCloseTo(0.065, 4);
    });
  });

  describe("getEmbeddingConfig", () => {
    it("returns correct dimensions for small model", () => {
      const config = getEmbeddingConfig("text-embedding-3-small");
      expect(config.dimensions).toBe(1536);
      expect(config.perMillion).toBe(0.02);
    });

    it("returns correct dimensions for large model", () => {
      const config = getEmbeddingConfig("text-embedding-3-large");
      expect(config.dimensions).toBe(3072);
      expect(config.perMillion).toBe(0.13);
    });
  });

  describe("getDefaultModel", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("returns cheapest available model when OpenAI key is set", () => {
      process.env.OPENAI_API_KEY = "test-key";
      process.env.ANTHROPIC_API_KEY = "";
      const model = getDefaultModel();
      expect(model).not.toBeNull();
      expect(model!.provider).toBe("openai");
      // gpt-4o-mini is cheapest OpenAI
      expect(model!.id).toBe("gpt-4o-mini");
    });

    it("returns null when no API keys are set", () => {
      process.env.OPENAI_API_KEY = "";
      process.env.ANTHROPIC_API_KEY = "";
      const model = getDefaultModel();
      expect(model).toBeNull();
    });

    it("filters by vision support", () => {
      process.env.OPENAI_API_KEY = "test-key";
      const model = getDefaultModel({ needsVision: true });
      expect(model).not.toBeNull();
      expect(model!.supportsVision).toBe(true);
    });

    it("filters by preferred provider", () => {
      process.env.OPENAI_API_KEY = "test-key";
      process.env.ANTHROPIC_API_KEY = "test-key";
      const model = getDefaultModel({ preferProvider: "anthropic" });
      expect(model).not.toBeNull();
      expect(model!.provider).toBe("anthropic");
    });
  });

  describe("getAvailableModels", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("returns only OpenAI models when only OpenAI key is set", () => {
      process.env.OPENAI_API_KEY = "test-key";
      process.env.ANTHROPIC_API_KEY = "";
      const models = getAvailableModels();
      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.provider === "openai")).toBe(true);
    });

    it("filters by provider", () => {
      process.env.OPENAI_API_KEY = "test-key";
      process.env.ANTHROPIC_API_KEY = "test-key";
      const anthropicModels = getAvailableModels("anthropic");
      expect(anthropicModels.every((m) => m.provider === "anthropic")).toBe(true);
    });
  });
});
