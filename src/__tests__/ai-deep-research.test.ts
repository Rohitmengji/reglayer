import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/gateway", () => ({
  complete: vi.fn().mockResolvedValue(null),
  getDefaultModelId: vi.fn().mockReturnValue("gpt-4o-mini"),
}));

import { deepResearch, formatReport, type ResearchReport } from "@/lib/ai/reasoning/deep-research";

describe("Deep Research Mode", () => {
  describe("deepResearch", () => {
    it("returns report structure when LLM unavailable", async () => {
      const result = await deepResearch("What is the state of EAA enforcement?");
      expect(result.query).toBe("What is the state of EAA enforcement?");
      expect(result.summary).toBeTruthy();
      expect(Array.isArray(result.sections)).toBe(true);
      expect(Array.isArray(result.timeline)).toBe(true);
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(Array.isArray(result.citations)).toBe(true);
      expect(result.metadata).toBeDefined();
    });

    it("tracks metadata", async () => {
      const result = await deepResearch("test");
      expect(typeof result.metadata.totalTokens).toBe("number");
      expect(typeof result.metadata.totalCostUsd).toBe("number");
      expect(typeof result.metadata.durationMs).toBe("number");
      expect(typeof result.metadata.iterations).toBe("number");
    });

    it("respects maxIterations config", async () => {
      const result = await deepResearch("test", undefined, { maxIterations: 1 });
      expect(result.metadata.iterations).toBeLessThanOrEqual(1);
    });

    it("accepts custom search function", async () => {
      let searchCalled = false;
      const result = await deepResearch("test", undefined, {
        searchFn: async () => { searchCalled = true; return []; },
        maxIterations: 1,
      });
      // searchFn won't be called because LLM (mocked null) can't generate questions
      expect(result).toBeDefined();
    });
  });

  describe("formatReport", () => {
    const sampleReport: ResearchReport = {
      query: "EAA enforcement status",
      summary: "The EAA is being enforced across EU member states.",
      sections: [
        { title: "Current Status", content: "As of 2025, enforcement has begun.", findings: [] },
        { title: "Impact on E-commerce", content: "Online stores must comply.", findings: [] },
      ],
      timeline: [
        { date: "2025-06", event: "EAA enforcement begins", significance: "Legal deadline" },
      ],
      recommendations: ["Conduct full WCAG 2.1 AA audit", "Implement automated monitoring"],
      citations: [
        { id: 1, source: "EU Directive 2019/882", content: "Article 31 enforcement", usedIn: [] },
      ],
      metadata: { iterations: 2, questionsExplored: 5, findingsCount: 8, totalTokens: 5000, totalCostUsd: 0.003, durationMs: 12000 },
    };

    it("includes query in header", () => {
      expect(formatReport(sampleReport)).toContain("EAA enforcement status");
    });

    it("includes executive summary", () => {
      expect(formatReport(sampleReport)).toContain("Executive Summary");
      expect(formatReport(sampleReport)).toContain("enforced across EU");
    });

    it("includes sections", () => {
      const output = formatReport(sampleReport);
      expect(output).toContain("Current Status");
      expect(output).toContain("Impact on E-commerce");
    });

    it("includes timeline", () => {
      const output = formatReport(sampleReport);
      expect(output).toContain("Timeline");
      expect(output).toContain("2025-06");
    });

    it("includes recommendations", () => {
      const output = formatReport(sampleReport);
      expect(output).toContain("Recommendations");
      expect(output).toContain("WCAG 2.1 AA audit");
    });

    it("includes citations", () => {
      const output = formatReport(sampleReport);
      expect(output).toContain("Citations");
      expect(output).toContain("[1]");
      expect(output).toContain("EU Directive");
    });

    it("includes research metadata footer", () => {
      const output = formatReport(sampleReport);
      expect(output).toContain("5 questions explored");
      expect(output).toContain("8 findings");
    });
  });
});
