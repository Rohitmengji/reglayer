import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { route, getProviderStatus, estimateCost, getAllProviders, PROVIDERS, type RoutingStrategy } from "@/lib/ai/gateway/providers/router";
import { LOCAL_PROVIDERS, getRecommendedModels, isLocalAvailable, getLocalBaseUrl } from "@/lib/ai/gateway/providers/local";

describe("GPU Router", () => {
  describe("PROVIDERS", () => {
    it("registers at least 7 providers", () => {
      expect(PROVIDERS.length).toBeGreaterThanOrEqual(7);
    });

    it("includes both cloud and local providers", () => {
      expect(PROVIDERS.some((p) => p.type === "cloud")).toBe(true);
      expect(PROVIDERS.some((p) => p.type === "local")).toBe(true);
    });

    it("each provider has at least one model", () => {
      for (const p of PROVIDERS) {
        expect(p.models.length).toBeGreaterThan(0);
      }
    });

    it("each model has pricing and latency", () => {
      for (const p of PROVIDERS) {
        for (const m of p.models) {
          expect(typeof m.costPer1kInput).toBe("number");
          expect(typeof m.avgLatencyMs).toBe("number");
          expect(m.contextWindow).toBeGreaterThan(0);
          expect(m.quality).toBeGreaterThan(0);
        }
      }
    });

    it("local models have zero cost", () => {
      const local = PROVIDERS.filter((p) => p.type === "local");
      for (const p of local) {
        for (const m of p.models) {
          expect(m.costPer1kInput).toBe(0);
          expect(m.costPer1kOutput).toBe(0);
        }
      }
    });
  });

  describe("route", () => {
    it("returns a route decision", () => {
      const decision = route("balanced");
      expect(decision.provider).toBeTruthy();
      expect(decision.model).toBeTruthy();
      expect(typeof decision.score).toBe("number");
      expect(decision.reason).toBeTruthy();
    });

    it("cheapest strategy returns a decision", () => {
      const decision = route("cheapest");
      expect(decision.provider).toBeTruthy();
      expect(decision.model).toBeTruthy();
    });

    it("fastest strategy returns a decision", () => {
      const decision = route("fastest");
      expect(decision.provider).toBeTruthy();
    });

    it("best strategy returns a decision", () => {
      const decision = route("best");
      expect(decision.provider).toBeTruthy();
    });

    it("includes fallback providers", () => {
      const decision = route("balanced");
      expect(Array.isArray(decision.fallbacks)).toBe(true);
    });

    it("filters by capability requirements", () => {
      const decision = route("balanced", { capabilities: ["chat"] });
      expect(decision.provider).toBeTruthy();
    });
  });

  describe("estimateCost", () => {
    it("calculates cost for known model", () => {
      const cost = estimateCost("gpt-4o-mini", 1000, 500);
      expect(cost).toBeGreaterThan(0);
    });

    it("returns 0 for unknown model", () => {
      expect(estimateCost("nonexistent", 1000, 500)).toBe(0);
    });

    it("local models cost 0", () => {
      expect(estimateCost("ollama-llama3", 1000, 500)).toBe(0);
    });
  });

  describe("getProviderStatus", () => {
    it("returns status for all providers", () => {
      const status = getProviderStatus();
      expect(Object.keys(status).length).toBe(PROVIDERS.length);
    });
  });
});

describe("Local AI", () => {
  describe("LOCAL_PROVIDERS", () => {
    it("defines 3 local providers", () => {
      expect(Object.keys(LOCAL_PROVIDERS)).toHaveLength(3);
    });

    it("each has default URL and env key", () => {
      for (const [, config] of Object.entries(LOCAL_PROVIDERS)) {
        expect(config.defaultUrl).toContain("localhost");
        expect(config.envKey).toBeTruthy();
        expect(config.apiPath).toBeTruthy();
      }
    });
  });

  describe("getRecommendedModels", () => {
    it("returns tiered recommendations", () => {
      const models = getRecommendedModels();
      expect(models.length).toBeGreaterThanOrEqual(3);
      expect(models.some((m) => m.tier.includes("Minimum"))).toBe(true);
      expect(models.some((m) => m.tier.includes("Embedding"))).toBe(true);
    });
  });

  describe("getLocalBaseUrl", () => {
    it("returns default URL for ollama", () => {
      expect(getLocalBaseUrl("ollama")).toContain("11434");
    });

    it("returns default URL for vllm", () => {
      expect(getLocalBaseUrl("vllm")).toContain("8000");
    });
  });

  describe("isLocalAvailable", () => {
    it("returns boolean", () => {
      expect(typeof isLocalAvailable()).toBe("boolean");
    });
  });
});
