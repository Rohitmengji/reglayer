/**
 * Tests for Retrieval Pipeline Optimizer
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/cache/redis", () => ({ getRedis: () => null }));
vi.mock("@/lib/ai/gateway", () => ({ embed: vi.fn().mockResolvedValue(null), complete: vi.fn() }));
vi.mock("@/lib/ai/search/hybrid", () => ({
  hybridSearch: vi.fn().mockResolvedValue([]),
  multiQuerySearch: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/ai/graph/service", () => ({
  buildGraphContext: vi.fn().mockResolvedValue({ entities: [], paths: [], context: "" }),
}));
vi.mock("@/lib/ai/knowledge/service", () => ({
  searchKnowledge: vi.fn().mockResolvedValue([]),
}));

import {
  optimizedRetrieve,
  autoPreset,
  FAST_PRESET,
  BALANCED_PRESET,
  THOROUGH_PRESET,
} from "@/lib/ai/retrieval/pipeline";

describe("Retrieval Pipeline Optimizer", () => {
  describe("autoPreset", () => {
    it("uses fast preset for conversational queries", () => {
      const preset = autoPreset("conversational");
      expect(preset.multiQuery).toBe(false);
      expect(preset.rerank).toBe(false);
      expect(preset.graph).toBe(false);
    });

    it("uses fast preset for simple lookups", () => {
      const preset = autoPreset("lookup");
      expect(preset.multiQuery).toBe(false);
      expect(preset.tokenBudget).toBeLessThanOrEqual(4000);
    });

    it("uses balanced preset for comparisons", () => {
      const preset = autoPreset("comparison");
      expect(preset.graph).toBe(true);
      expect(preset.knowledge).toBe(true);
    });

    it("uses thorough preset for analysis", () => {
      const preset = autoPreset("analysis");
      expect(preset.multiQuery).toBe(true);
      expect(preset.rerank).toBe(true);
      expect(preset.graph).toBe(true);
    });

    it("uses thorough preset for multi-step", () => {
      const preset = autoPreset("multi_step");
      expect(preset.multiQuery).toBe(true);
      expect(preset.rerank).toBe(true);
    });
  });

  describe("presets", () => {
    it("FAST has smallest token budget", () => {
      expect(FAST_PRESET.tokenBudget!).toBeLessThanOrEqual(BALANCED_PRESET.tokenBudget!);
    });

    it("THOROUGH has largest token budget", () => {
      expect(THOROUGH_PRESET.tokenBudget!).toBeGreaterThanOrEqual(BALANCED_PRESET.tokenBudget!);
    });

    it("THOROUGH enables all features", () => {
      expect(THOROUGH_PRESET.multiQuery).toBe(true);
      expect(THOROUGH_PRESET.rerank).toBe(true);
      expect(THOROUGH_PRESET.graph).toBe(true);
      expect(THOROUGH_PRESET.knowledge).toBe(true);
      expect(THOROUGH_PRESET.cache).toBe(true);
    });
  });

  describe("optimizedRetrieve", () => {
    it("skips retrieval for conversational queries", async () => {
      const result = await optimizedRetrieve("hi");
      expect(result.intent).toBe("conversational");
      expect(result.context).toBe("");
      expect(result.sourceCount).toBe(0);
      expect(result.totalLatencyMs).toBeLessThan(100);
    });

    it("returns empty context when no results found", async () => {
      const result = await optimizedRetrieve("What violations exist?", {
        workspaceId: "ws-1",
        userId: "u-1",
        cache: false,
      });
      expect(result.context).toBe("");
      expect(result.cached).toBe(false);
    });

    it("reports pipeline stages", async () => {
      const result = await optimizedRetrieve("Show me color contrast issues", {
        workspaceId: "ws-1",
        userId: "u-1",
        cache: false,
      });
      expect(result.stages.length).toBeGreaterThan(0);
      expect(result.stages.some((s) => s.name === "hybrid-search")).toBe(true);
    });

    it("includes latency tracking", async () => {
      const result = await optimizedRetrieve("test query", {
        cache: false,
      });
      expect(result.totalLatencyMs).toBeGreaterThanOrEqual(0);
      expect(result.stages.every((s) => typeof s.latencyMs === "number")).toBe(true);
    });

    it("disables graph and knowledge when no workspace", async () => {
      const result = await optimizedRetrieve("Find violations", {
        graph: true,
        knowledge: true,
        cache: false,
        // no workspaceId
      });
      const graphStage = result.stages.find((s) => s.name === "graph-rag");
      const kbStage = result.stages.find((s) => s.name === "knowledge-search");
      expect(graphStage?.skipped).toBe(true);
      expect(kbStage?.skipped).toBe(true);
    });
  });
});
