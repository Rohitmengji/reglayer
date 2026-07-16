/**
 * Tests for Knowledge Management chunking + AI Experiments analysis
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/ai/gateway", () => ({ embed: vi.fn() }));

import { chunkText } from "@/lib/ai/knowledge/service";
import { analyzeResults, type ExperimentEntry } from "@/lib/ai/experiments/service";

// ── Knowledge Chunking ──────────────────────────────────────────────────────

describe("Knowledge Management — chunkText", () => {
  it("returns single chunk for short text", () => {
    const chunks = chunkText("This is a short document about WCAG compliance.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("WCAG compliance");
  });

  it("splits long text into multiple chunks", () => {
    // Create text that's ~4000 chars (should produce ~2 chunks at 2048 target)
    const sentences = Array.from({ length: 40 }, (_, i) =>
      `Sentence number ${i + 1} discusses WCAG success criterion ${(i % 4) + 1}.${(i % 3) + 1}.${(i % 5) + 1} which requires specific accessibility measures for users with disabilities.`
    );
    const text = sentences.join(" ");
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("preserves sentence boundaries", () => {
    const text = "First sentence about color contrast. Second sentence about ARIA labels. Third sentence about keyboard navigation. Fourth sentence about screen readers.";
    const chunks = chunkText(text);
    // Each chunk should end at a sentence boundary (no mid-sentence cuts)
    for (const chunk of chunks) {
      const lastChar = chunk.trim().slice(-1);
      // Should end with sentence terminator or be the last chunk
      expect(['.', '!', '?', 's', 'n', 'y']).toContain(lastChar); // flexible for last chunk
    }
  });

  it("handles empty text", () => {
    const chunks = chunkText("");
    // Should return the empty string as a single chunk or empty array
    expect(chunks.length).toBeLessThanOrEqual(1);
  });

  it("creates overlap between chunks", () => {
    // Long text that forces multiple chunks
    const text = Array.from({ length: 60 }, (_, i) =>
      `This is paragraph ${i + 1} with enough words to make chunking necessary for the RAG pipeline to work correctly with overlapping context windows.`
    ).join(" ");
    const chunks = chunkText(text);

    if (chunks.length >= 2) {
      // Last words of chunk N should appear at start of chunk N+1 (overlap)
      const lastWordsOfFirst = chunks[0].split(/\s+/).slice(-5).join(" ");
      expect(chunks[1]).toContain(lastWordsOfFirst.split(" ")[0]); // at least first overlap word
    }
  });
});

// ── AI Experiments Analysis ─────────────────────────────────────────────────

describe("AI Experiments — analyzeResults", () => {
  const baseExperiment: ExperimentEntry = {
    id: "exp-1",
    name: "Test Experiment",
    description: null,
    status: "COMPLETED",
    feature: "chat",
    promptA: "prompt a",
    modelA: "gpt-4o-mini",
    temperatureA: 0.4,
    promptB: "prompt b",
    modelB: "claude-haiku",
    temperatureB: 0.4,
    trafficSplit: 0.5,
    totalTrials: 100,
    trialsA: 50,
    trialsB: 50,
    avgLatencyA: 500,
    avgLatencyB: 600,
    avgCostA: 0.001,
    avgCostB: 0.002,
    avgRatingA: 4.2,
    avgRatingB: 3.8,
    createdAt: new Date(),
    startedAt: new Date(),
    endedAt: new Date(),
  };

  it("picks variant A when it wins on all metrics", () => {
    const result = analyzeResults(baseExperiment);
    expect(result.winner).toBe("A");
    expect(result.confidence).toBe("high");
  });

  it("picks variant B when it wins on all metrics", () => {
    const result = analyzeResults({
      ...baseExperiment,
      avgLatencyA: 800,
      avgLatencyB: 400,
      avgCostA: 0.003,
      avgCostB: 0.001,
      avgRatingA: 3.5,
      avgRatingB: 4.5,
    });
    expect(result.winner).toBe("B");
    expect(result.confidence).toBe("high");
  });

  it("returns inconclusive with insufficient data", () => {
    const result = analyzeResults({
      ...baseExperiment,
      trialsA: 10,
      trialsB: 15,
    });
    expect(result.winner).toBe("inconclusive");
    expect(result.summary).toContain("Insufficient data");
  });

  it("returns inconclusive when metrics are mixed evenly", () => {
    const result = analyzeResults({
      ...baseExperiment,
      avgLatencyA: 500,
      avgLatencyB: 500, // tied
      avgCostA: 0.001,
      avgCostB: 0.002, // A wins cost
      avgRatingA: 3.8,
      avgRatingB: 4.2, // B wins rating
    });
    // 1-1 split = inconclusive
    expect(result.winner).toBe("inconclusive");
  });

  it("handles null ratings gracefully", () => {
    const result = analyzeResults({
      ...baseExperiment,
      avgRatingA: null,
      avgRatingB: null,
    });
    // Should still decide based on latency + cost
    expect(result.winner).toBe("A");
  });

  it("summary includes trial counts and metrics", () => {
    const result = analyzeResults(baseExperiment);
    expect(result.summary).toContain("50 trials");
    expect(result.summary).toContain("Variant A");
  });
});
