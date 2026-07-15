/**
 * RegLayer — AI Observability Service Tests
 *
 * WHY: The observability service powers the AI cost dashboard.
 *      Incorrect aggregation = wrong numbers shown to users.
 * WHAT: Tests event persistence, usage summary, cost-by-feature grouping,
 *       and daily usage aggregation.
 * HOW: Mocks Prisma to test query logic without DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockCreate = vi.fn();
const mockAggregate = vi.fn();
const mockCount = vi.fn();
const mockGroupBy = vi.fn();
const mockFindMany = vi.fn();

vi.mock("@/lib/database/prisma", () => ({
  prisma: {
    aiEvent: {
      create: (...args: unknown[]) => mockCreate(...args),
      aggregate: (...args: unknown[]) => mockAggregate(...args),
      count: (...args: unknown[]) => mockCount(...args),
      groupBy: (...args: unknown[]) => mockGroupBy(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

import {
  persistEventHandler,
  getUsageSummary,
  getCostByFeature,
  getDailyUsage,
} from "@/lib/ai/observability/service";
import type { GatewayEvent } from "@/lib/ai/gateway/types";

describe("AI Observability Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("persistEventHandler", () => {
    const mockEvent: GatewayEvent = {
      type: "ai.completion",
      timestamp: new Date("2026-07-15T10:00:00Z"),
      request: {
        model: "gpt-4o-mini",
        feature: "chat",
        workspaceId: "ws_123",
        userId: "user_456",
      },
      response: {
        model: "gpt-4o-mini",
        provider: "openai",
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        cost: { inputCost: 0.000015, outputCost: 0.00003, totalCost: 0.000045 },
        latencyMs: 320,
        success: true,
      },
    };

    it("persists event to database with correct data", async () => {
      mockCreate.mockResolvedValue({ id: "evt_1" });

      await persistEventHandler(mockEvent);

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          type: "ai.completion",
          feature: "chat",
          model: "gpt-4o-mini",
          provider: "openai",
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          costUsd: 0.000045,
          latencyMs: 320,
          success: true,
          error: null,
          userId: "user_456",
          workspaceId: "ws_123",
        },
      });
    });

    it("persists error field when present", async () => {
      mockCreate.mockResolvedValue({ id: "evt_2" });

      const errorEvent: GatewayEvent = {
        ...mockEvent,
        response: {
          ...mockEvent.response,
          success: false,
          error: "Rate limit exceeded",
        },
      };

      await persistEventHandler(errorEvent);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            success: false,
            error: "Rate limit exceeded",
          }),
        }),
      );
    });

    it("does not throw when database write fails (fire-and-forget)", async () => {
      mockCreate.mockRejectedValue(new Error("Connection lost"));

      // Should not throw
      await expect(persistEventHandler(mockEvent)).resolves.toBeUndefined();
    });
  });

  describe("getUsageSummary", () => {
    it("returns aggregated usage metrics", async () => {
      mockAggregate.mockResolvedValue({
        _sum: { totalTokens: 50_000, costUsd: 1.25 },
        _avg: { latencyMs: 450.7 },
        _count: 100,
      });
      mockCount.mockResolvedValue(95);

      const result = await getUsageSummary({ days: 30 });

      expect(result).toEqual({
        totalRequests: 100,
        totalTokens: 50_000,
        totalCostUsd: 1.25,
        avgLatencyMs: 451, // rounded
        successRate: 0.95, // 95/100
      });
    });

    it("returns safe defaults when no events exist", async () => {
      mockAggregate.mockResolvedValue({
        _sum: { totalTokens: null, costUsd: null },
        _avg: { latencyMs: null },
        _count: 0,
      });
      mockCount.mockResolvedValue(0);

      const result = await getUsageSummary({ days: 7 });

      expect(result).toEqual({
        totalRequests: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        avgLatencyMs: 0,
        successRate: 1, // no events = 100% (avoid division by zero)
      });
    });

    it("filters by workspaceId when provided", async () => {
      mockAggregate.mockResolvedValue({
        _sum: { totalTokens: 1000, costUsd: 0.05 },
        _avg: { latencyMs: 200 },
        _count: 10,
      });
      mockCount.mockResolvedValue(10);

      await getUsageSummary({ workspaceId: "ws_abc", days: 14 });

      expect(mockAggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: "ws_abc",
          }),
        }),
      );
    });
  });

  describe("getCostByFeature", () => {
    it("returns cost breakdown grouped by feature", async () => {
      mockGroupBy.mockResolvedValue([
        { feature: "chat", _sum: { costUsd: 0.80 }, _count: 50 },
        { feature: "violation-explainer", _sum: { costUsd: 0.35 }, _count: 30 },
        { feature: "visual-scan", _sum: { costUsd: 0.10 }, _count: 5 },
      ]);

      const result = await getCostByFeature({ days: 30 });

      expect(result).toEqual([
        { feature: "chat", cost: 0.80, requests: 50 },
        { feature: "violation-explainer", cost: 0.35, requests: 30 },
        { feature: "visual-scan", cost: 0.10, requests: 5 },
      ]);
    });

    it("returns empty array when no events exist", async () => {
      mockGroupBy.mockResolvedValue([]);

      const result = await getCostByFeature({ days: 7 });
      expect(result).toEqual([]);
    });
  });

  describe("getDailyUsage", () => {
    it("groups events by day correctly", async () => {
      mockFindMany.mockResolvedValue([
        { createdAt: new Date("2026-07-14T08:00:00Z"), totalTokens: 500, costUsd: 0.01 },
        { createdAt: new Date("2026-07-14T14:00:00Z"), totalTokens: 300, costUsd: 0.008 },
        { createdAt: new Date("2026-07-15T09:00:00Z"), totalTokens: 1000, costUsd: 0.05 },
      ]);

      const result = await getDailyUsage({ days: 7 });

      expect(result).toHaveLength(2);
      expect(result[0].date).toBe("2026-07-14");
      expect(result[0].requests).toBe(2);
      expect(result[0].tokens).toBe(800);
      expect(result[0].cost).toBeCloseTo(0.018, 6);
      expect(result[1].date).toBe("2026-07-15");
      expect(result[1].requests).toBe(1);
      expect(result[1].tokens).toBe(1000);
      expect(result[1].cost).toBeCloseTo(0.05, 6);
    });

    it("returns empty array when no events exist", async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await getDailyUsage({ days: 14 });
      expect(result).toEqual([]);
    });
  });
});
