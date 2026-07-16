import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { LineageBuilder, formatLineageChain, traceToHeaders } from "@/lib/ai/lineage/tracker";

describe("Data Lineage Tracker", () => {
  function buildSampleTrace() {
    return new LineageBuilder("tr_test_abc123")
      .recordInput("What WCAG criteria does our site violate?", "user-1", "ws-1")
      .recordCache(false, "miss", 5)
      .recordRetrieval({ source: "hybrid-search", resultCount: 8, durationMs: 150 })
      .recordRetrieval({ source: "graph-rag", resultCount: 3, durationMs: 80 })
      .recordCompression({ inputTokens: 5000, outputTokens: 2000, chunksIn: 11, chunksOut: 6, durationMs: 12 })
      .recordPrompt("chat-rag", 2)
      .recordGeneration({ model: "gpt-4o-mini", provider: "openai", inputTokens: 2500, outputTokens: 800, costUsd: 0.0006, durationMs: 1200, temperature: 0.3 })
      .recordGuardrails([
        { guardId: "output-length", severity: "pass" },
        { guardId: "wcag-hallucination", severity: "pass" },
        { guardId: "topic-relevance", severity: "warn", reason: "borderline relevance" },
      ])
      .recordOutput(1500)
      .build();
  }

  describe("LineageBuilder", () => {
    it("generates a trace ID", () => {
      const builder = new LineageBuilder();
      expect(builder.getTraceId()).toMatch(/^tr_/);
    });

    it("uses provided trace ID", () => {
      const builder = new LineageBuilder("tr_custom_id");
      expect(builder.getTraceId()).toBe("tr_custom_id");
    });

    it("builds a complete trace with all stages", () => {
      const trace = buildSampleTrace();
      expect(trace.traceId).toBe("tr_test_abc123");
      expect(trace.stages.length).toBeGreaterThanOrEqual(8);
    });

    it("populates summary correctly", () => {
      const trace = buildSampleTrace();
      expect(trace.summary.model).toBe("gpt-4o-mini");
      expect(trace.summary.provider).toBe("openai");
      expect(trace.summary.promptId).toBe("chat-rag");
      expect(trace.summary.promptVersion).toBe(2);
      expect(trace.summary.retrievalSources).toContain("hybrid-search");
      expect(trace.summary.retrievalSources).toContain("graph-rag");
      expect(trace.summary.documentsRetrieved).toBe(11);
      expect(trace.summary.totalTokens).toBe(3300);
      expect(trace.summary.costUsd).toBe(0.0006);
      expect(trace.summary.cached).toBe(false);
    });

    it("tracks guardrail results", () => {
      const trace = buildSampleTrace();
      expect(trace.summary.guardrailsPassed).toContain("output-length");
      expect(trace.summary.guardrailsPassed).toContain("wcag-hallucination");
      expect(trace.summary.guardrailsWarned).toContain("topic-relevance");
    });

    it("records tool calls", () => {
      const trace = new LineageBuilder()
        .recordToolCall("getViolations", 50, true, "[{ruleId: 'color-contrast'}]")
        .recordToolCall("scanSite", 3000, true)
        .build();
      expect(trace.summary.toolsCalled).toEqual(["getViolations", "scanSite"]);
    });

    it("records agent handoffs", () => {
      const trace = new LineageBuilder()
        .recordAgentHandoff("compliance-auditor", "legal-analyst", "Check ADA Title III")
        .build();
      expect(trace.stages.some((s) => s.name.includes("handoff"))).toBe(true);
    });

    it("records cache hits", () => {
      const trace = new LineageBuilder()
        .recordCache(true, "exact", 2)
        .build();
      expect(trace.summary.cached).toBe(true);
    });
  });

  describe("formatLineageChain", () => {
    it("produces human-readable output", () => {
      const trace = buildSampleTrace();
      const output = formatLineageChain(trace);
      expect(output).toContain("tr_test_abc123");
      expect(output).toContain("gpt-4o-mini");
      expect(output).toContain("chat-rag");
      expect(output).toContain("hybrid-search");
      expect(output).toContain("graph-rag");
      expect(output).toContain("Pipeline:");
      expect(output).toContain("Summary:");
    });

    it("shows stage categories", () => {
      const output = formatLineageChain(buildSampleTrace());
      expect(output).toContain("[input]");
      expect(output).toContain("[retrieval]");
      expect(output).toContain("[generation]");
      expect(output).toContain("[validation]");
    });

    it("shows guardrail warnings", () => {
      const output = formatLineageChain(buildSampleTrace());
      expect(output).toContain("2 passed");
      expect(output).toContain("1 warned");
    });
  });

  describe("traceToHeaders", () => {
    it("produces response headers", () => {
      const headers = traceToHeaders(buildSampleTrace());
      expect(headers["X-Trace-Id"]).toBe("tr_test_abc123");
      expect(headers["X-Model"]).toBe("gpt-4o-mini");
      expect(headers["X-Prompt"]).toBe("chat-rag@v2");
      expect(headers["X-Sources"]).toContain("hybrid-search");
      expect(headers["X-Tokens"]).toBe("3300");
      expect(headers["X-Cached"]).toBe("false");
    });
  });
});
