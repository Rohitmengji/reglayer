import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", () => ({ prisma: { aiEvent: { findMany: vi.fn().mockResolvedValue([]), aggregate: vi.fn().mockResolvedValue({ _sum: { costUsd: 0 } }) }, aiExperiment: { count: vi.fn().mockResolvedValue(0), findFirst: vi.fn().mockResolvedValue(null) }, feedbackEntry: { count: vi.fn().mockResolvedValue(0), aggregate: vi.fn().mockResolvedValue({ _avg: { rating: null } }), groupBy: vi.fn().mockResolvedValue([]) }, promptImprovement: { findFirst: vi.fn().mockResolvedValue(null) } } }));

import { estimateComplexity, routeByComplexity } from "@/lib/ai/intelligence/engine";

describe("Platform Intelligence Engine", () => {
  describe("estimateComplexity", () => {
    it("classifies short simple queries", () => {
      expect(estimateComplexity("What is WCAG?")).toBe("simple");
      expect(estimateComplexity("Hi")).toBe("simple");
    });

    it("classifies moderate queries", () => {
      expect(estimateComplexity("Explain how color contrast affects readability")).toBe("moderate");
      expect(estimateComplexity("Which WCAG criteria should we target?")).toBe("moderate");
    });

    it("classifies complex queries", () => {
      expect(estimateComplexity("Analyze all violations across our entire site and provide a comprehensive remediation plan with effort estimates")).toBe("complex");
    });

    it("classifies reasoning queries", () => {
      expect(estimateComplexity("Compare WCAG 2.1 AA and 2.2 AA and derive which new criteria affect our checkout flow step by step")).toBe("reasoning");
      expect(estimateComplexity("If we fix color contrast, then calculate the score improvement")).toBe("reasoning");
    });
  });

  describe("routeByComplexity", () => {
    it("routes simple queries to nano tier", () => {
      const route = routeByComplexity("What is WCAG?");
      expect(route.tier).toBe("nano");
      expect(route.estimatedCost).toBeLessThan(0.001);
    });

    it("routes complex queries to premium tier", () => {
      const route = routeByComplexity("Analyze all violations and provide a comprehensive detailed audit of our entire site");
      expect(route.tier).toBe("premium");
    });

    it("routes reasoning queries to reasoning tier", () => {
      const route = routeByComplexity("Compare option A and B and C, derive the trade-off for each step by step");
      expect(route.tier).toBe("reasoning");
    });

    it("high-stakes context forces premium", () => {
      const route = routeByComplexity("Simple question", { isHighStakes: true });
      expect(route.tier).toBe("premium");
    });

    it("includes cost estimate", () => {
      const route = routeByComplexity("test");
      expect(typeof route.estimatedCost).toBe("number");
      expect(route.estimatedCost).toBeGreaterThanOrEqual(0);
    });

    it("includes reason", () => {
      const route = routeByComplexity("explain something");
      expect(route.reason.length).toBeGreaterThan(5);
    });

    it("all tiers have a model assigned", () => {
      const queries = ["hi", "explain this", "analyze everything in detail comprehensively", "prove step by step"];
      for (const q of queries) {
        expect(routeByComplexity(q).model).toBeTruthy();
      }
    });
  });
});
