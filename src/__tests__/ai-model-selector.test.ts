/**
 * Model selection.
 *
 * The failure modes here are financial and silent: overpaying on every request, or
 * routing to a model that cannot do the job. Both look like normal operation.
 */

import { describe, it, expect } from "vitest";
import {
  blendedCost,
  qualityFloorFor,
  selectModel,
  type SelectionRequest,
} from "@/lib/ai/routing/selector";
import type { ModelConfig, ModelId } from "@/lib/ai/gateway/types";

function model(overrides: Partial<ModelConfig> & { id: ModelId }): ModelConfig {
  return {
    providerModelId: overrides.id,
    provider: "openai",
    displayName: overrides.id,
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    pricing: { inputPerMillion: 1, outputPerMillion: 4 },
    supportsVision: true,
    supportsJsonMode: true,
    quality: 8,
    avgLatencyMs: 800,
    isAvailable: () => true,
    ...overrides,
  } as ModelConfig;
}

const CHEAP_FAST = model({
  id: "gpt-4o-mini",
  pricing: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  quality: 8,
  avgLatencyMs: 800,
});

const CHEAPEST_FASTEST = model({
  id: "gemini-2.0-flash",
  provider: "google",
  pricing: { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  quality: 8,
  avgLatencyMs: 400,
});

const FRONTIER = model({
  id: "gpt-4o",
  pricing: { inputPerMillion: 2.5, outputPerMillion: 10 },
  quality: 10,
  avgLatencyMs: 1200,
});

const CATALOGUE = [CHEAP_FAST, CHEAPEST_FASTEST, FRONTIER];
const FALLBACK: ModelId = "gpt-4o-mini";

function select(request: Partial<SelectionRequest> = {}, catalogue = CATALOGUE) {
  return selectModel({ complexity: 10, ...request }, catalogue, FALLBACK);
}

describe("cost optimisation", () => {
  it("does not pay frontier prices for a simple question", () => {
    // Every request previously used one default model; this is the saving.
    expect(select({ complexity: 5 }).modelId).toBe("gemini-2.0-flash");
  });

  it("escalates when the question demands capability", () => {
    expect(select({ complexity: 90 }).modelId).toBe("gpt-4o");
  });

  it("picks the cheapest model clearing the floor, not the highest quality", () => {
    // A floor plus "cheapest above it" adopts a new cheap-but-capable model
    // automatically, where a tier table would need rewriting.
    const result = select({ complexity: 40 });
    expect(result.modelId).toBe("gemini-2.0-flash");
  });

  it("weights output tokens, which dominate chat spend", () => {
    const outputHeavy = model({ id: "gpt-4o", pricing: { inputPerMillion: 0.1, outputPerMillion: 30 } });
    const inputHeavy = model({ id: "gpt-4o-mini", pricing: { inputPerMillion: 5, outputPerMillion: 1 } });
    expect(blendedCost(inputHeavy)).toBeLessThan(blendedCost(outputHeavy));
  });
});

describe("hard requirements", () => {
  it("never selects a model that cannot do the job", () => {
    const noVision = model({ id: "gemini-2.0-flash", supportsVision: false, pricing: { inputPerMillion: 0.01, outputPerMillion: 0.01 } });
    // A model that cannot serve the request is never a saving, however cheap.
    expect(select({ needsVision: true }, [noVision, CHEAP_FAST]).modelId).toBe("gpt-4o-mini");
  });

  it("respects the context window a request actually needs", () => {
    const small = model({ id: "gemini-2.0-flash", contextWindow: 8_000, pricing: { inputPerMillion: 0.01, outputPerMillion: 0.01 } });
    expect(select({ minContextWindow: 100_000 }, [small, CHEAP_FAST]).modelId).toBe("gpt-4o-mini");
  });

  it("ignores models whose provider is not configured", () => {
    const unconfigured = model({ id: "gemini-2.0-flash", isAvailable: () => false, pricing: { inputPerMillion: 0.01, outputPerMillion: 0.01 } });
    expect(select({}, [unconfigured, CHEAP_FAST]).modelId).toBe("gpt-4o-mini");
  });
});

describe("objectives", () => {
  it("optimises for latency when asked", () => {
    expect(select({ objective: "latency" }).modelId).toBe("gemini-2.0-flash");
  });

  it("optimises for quality when asked", () => {
    expect(select({ objective: "quality" }).modelId).toBe("gpt-4o");
  });
});

describe("per-user and per-feature pinning", () => {
  it("honours an available pin", () => {
    const result = select({ preferred: "gpt-4o" });
    expect(result.modelId).toBe("gpt-4o");
    expect(result.reason).toContain("pinned");
  });

  it("degrades to automatic selection rather than breaking on a stale pin", () => {
    const gone = model({ id: "claude-opus", isAvailable: () => false });
    const result = select({ preferred: "claude-opus" }, [...CATALOGUE, gone]);

    // A stale per-user preference must not take that user's chat down.
    expect(result.modelId).not.toBe("claude-opus");
    expect(result.reason).not.toContain("pinned");
  });

  it("refuses a pin that cannot meet a hard requirement", () => {
    const blind = model({ id: "gpt-4o", supportsVision: false });
    const result = select({ preferred: "gpt-4o", needsVision: true }, [blind, CHEAP_FAST]);
    expect(result.modelId).toBe("gpt-4o-mini");
  });
});

describe("graceful degradation", () => {
  it("answers with a weaker model rather than not answering", () => {
    const onlyWeak = [model({ id: "gpt-4o-mini", quality: 6 })];
    const result = select({ complexity: 95 }, onlyWeak);

    expect(result.modelId).toBe("gpt-4o-mini");
    expect(result.reason).toContain("degraded");
  });

  it("falls back to the known-good default when nothing qualifies", () => {
    const result = select({ needsVision: true }, [model({ id: "gpt-4o", supportsVision: false, isAvailable: () => false })]);
    expect(result.modelId).toBe(FALLBACK);
    expect(result.reason).toBe("no-candidate-available");
  });

  it("always explains the decision, so lineage is auditable", () => {
    expect(select().reason.length).toBeGreaterThan(0);
  });
});

describe("quality floor", () => {
  it("rises with complexity", () => {
    expect(qualityFloorFor(10)).toBeLessThan(qualityFloorFor(45));
    expect(qualityFloorFor(45)).toBeLessThan(qualityFloorFor(80));
  });
});
