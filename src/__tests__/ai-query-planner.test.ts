/**
 * Tests for Query Planning Engine — intent classification, plan generation, topological sort
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/ai/gateway", () => ({ complete: vi.fn(), embed: vi.fn() }));

import {
  classifyIntent,
  generatePlan,
  topologicalSort,
  buildSynthesisContext,
  executePlan,
  type PlanStep,
  type PlanExecutionResult,
  type QueryPlan,
  type StepResult,
} from "@/lib/ai/planner/engine";

describe("Query Planning Engine", () => {
  // ── Intent Classification ───────────────────────────────────────────────

  describe("classifyIntent", () => {
    it("classifies short greetings as conversational", () => {
      expect(classifyIntent("hi")).toBe("conversational");
      expect(classifyIntent("hello")).toBe("conversational");
      expect(classifyIntent("thanks")).toBe("conversational");
    });

    it("classifies comparison queries", () => {
      expect(classifyIntent("Compare scan A vs scan B")).toBe("comparison");
      expect(classifyIntent("What's the difference between last month and now?")).toBe("comparison");
      expect(classifyIntent("Has the score dropped since the regression?")).toBe("comparison");
    });

    it("classifies analysis queries", () => {
      expect(classifyIntent("Why is our accessibility score dropping?")).toBe("analysis");
      expect(classifyIntent("What's the root cause of these failures?")).toBe("analysis");
      expect(classifyIntent("Analyze the trend in our violation count")).toBe("analysis");
    });

    it("classifies multi-step queries", () => {
      expect(classifyIntent("Find all critical violations and suggest fixes")).toBe("multi_step");
      expect(classifyIntent("List violations, group by WCAG criteria, and prioritize")).toBe("multi_step");
      expect(classifyIntent("First check the score and then generate a report")).toBe("multi_step");
    });

    it("classifies simple lookups", () => {
      expect(classifyIntent("What is WCAG 1.4.3?")).toBe("lookup");
      expect(classifyIntent("Show me the color contrast violations")).toBe("lookup");
      expect(classifyIntent("How do I fix aria-label issues?")).toBe("lookup");
    });
  });

  // ── Plan Generation ─────────────────────────────────────────────────────

  describe("generatePlan", () => {
    it("returns single LLM step for conversational queries", async () => {
      const plan = await generatePlan("hi");
      expect(plan.intent).toBe("conversational");
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].source).toBe("llm");
    });

    it("generates lookup plan with regulation source for WCAG queries", async () => {
      const plan = await generatePlan("What does WCAG 1.4.3 require?");
      expect(plan.intent).toBe("lookup");
      expect(plan.steps.some((s) => s.source === "regulations")).toBe(true);
    });

    it("generates lookup plan with violations source for violation queries", async () => {
      const plan = await generatePlan("What are the critical violations from the last scan?");
      expect(plan.steps.some((s) => s.source === "violations" || s.source === "scans")).toBe(true);
    });

    it("generates lookup plan with graph source for site queries", async () => {
      const plan = await generatePlan("What violations does our checkout page have?");
      expect(plan.intent).toBe("lookup");
      expect(plan.steps.some((s) => s.source === "graph" || s.source === "violations")).toBe(true);
    });

    it("generates lookup plan with knowledge source for policy queries", async () => {
      const plan = await generatePlan("What does our internal accessibility policy say?");
      expect(plan.intent).toBe("lookup");
      expect(plan.steps.some((s) => s.source === "knowledge")).toBe(true);
    });

    it("includes default steps when no specific sources match", async () => {
      const plan = await generatePlan("Help me improve my website");
      expect(plan.intent).toBe("lookup");
      expect(plan.steps.length).toBeGreaterThan(0);
    });
  });

  // ── Topological Sort ────────────────────────────────────────────────────

  describe("topologicalSort", () => {
    it("groups independent steps into one level", () => {
      const steps: PlanStep[] = [
        { id: "s1", query: "q1", source: "violations", reason: "r1" },
        { id: "s2", query: "q2", source: "scans", reason: "r2" },
        { id: "s3", query: "q3", source: "graph", reason: "r3" },
      ];
      const levels = topologicalSort(steps);
      expect(levels).toHaveLength(1);
      expect(levels[0]).toHaveLength(3);
    });

    it("separates dependent steps into sequential levels", () => {
      const steps: PlanStep[] = [
        { id: "s1", query: "q1", source: "violations", reason: "r1" },
        { id: "s2", query: "q2", source: "scans", reason: "r2", dependsOn: ["s1"] },
        { id: "s3", query: "q3", source: "llm", reason: "r3", dependsOn: ["s2"] },
      ];
      const levels = topologicalSort(steps);
      expect(levels).toHaveLength(3);
      expect(levels[0][0].id).toBe("s1");
      expect(levels[1][0].id).toBe("s2");
      expect(levels[2][0].id).toBe("s3");
    });

    it("handles diamond dependencies", () => {
      const steps: PlanStep[] = [
        { id: "s1", query: "q1", source: "violations", reason: "r1" },
        { id: "s2", query: "q2", source: "scans", reason: "r2", dependsOn: ["s1"] },
        { id: "s3", query: "q3", source: "graph", reason: "r3", dependsOn: ["s1"] },
        { id: "s4", query: "q4", source: "llm", reason: "r4", dependsOn: ["s2", "s3"] },
      ];
      const levels = topologicalSort(steps);
      expect(levels).toHaveLength(3);
      // Level 0: s1
      expect(levels[0].map((s) => s.id)).toEqual(["s1"]);
      // Level 1: s2, s3 (parallel)
      expect(levels[1].map((s) => s.id).sort()).toEqual(["s2", "s3"]);
      // Level 2: s4
      expect(levels[2].map((s) => s.id)).toEqual(["s4"]);
    });

    it("handles circular dependencies without infinite loop", () => {
      const steps: PlanStep[] = [
        { id: "s1", query: "q1", source: "violations", reason: "r1", dependsOn: ["s2"] },
        { id: "s2", query: "q2", source: "scans", reason: "r2", dependsOn: ["s1"] },
      ];
      const levels = topologicalSort(steps);
      // Should not hang — forces remaining into last level
      expect(levels.length).toBeGreaterThan(0);
    });
  });

  // ── Plan Execution ──────────────────────────────────────────────────────

  describe("executePlan", () => {
    it("executes independent steps in parallel", async () => {
      const plan: QueryPlan = {
        originalQuery: "test",
        intent: "lookup",
        steps: [
          { id: "s1", query: "q1", source: "violations", reason: "r1" },
          { id: "s2", query: "q2", source: "scans", reason: "r2" },
        ],
        synthesisPrompt: "Combine results",
      };

      const executors = {
        violations: async () => "violation data here",
        scans: async () => "scan data here",
      };

      const result = await executePlan(plan, executors);
      expect(result.stepResults).toHaveLength(2);
      expect(result.stepResults.every((r) => r.success)).toBe(true);
      expect(result.mergedContext).toContain("violation data");
      expect(result.mergedContext).toContain("scan data");
    });

    it("handles executor failures gracefully", async () => {
      const plan: QueryPlan = {
        originalQuery: "test",
        intent: "lookup",
        steps: [
          { id: "s1", query: "q1", source: "violations", reason: "r1" },
        ],
        synthesisPrompt: "Combine results",
      };

      const executors = {
        violations: async () => { throw new Error("DB down"); },
      };

      const result = await executePlan(plan, executors);
      expect(result.stepResults[0].success).toBe(false);
      expect(result.stepResults[0].data).toContain("DB down");
    });

    it("passes dependency context to dependent steps", async () => {
      const plan: QueryPlan = {
        originalQuery: "test",
        intent: "multi_step",
        steps: [
          { id: "s1", query: "get violations", source: "violations", reason: "r1" },
          { id: "s2", query: "analyze", source: "llm", reason: "r2", dependsOn: ["s1"] },
        ],
        synthesisPrompt: "Synthesize",
      };

      let receivedQuery = "";
      const executors = {
        violations: async () => "found: color-contrast critical",
        llm: async (q: string) => { receivedQuery = q; return "analysis complete"; },
      };

      await executePlan(plan, executors);
      expect(receivedQuery).toContain("color-contrast critical");
    });
  });

  // ── Synthesis Context ───────────────────────────────────────────────────

  describe("buildSynthesisContext", () => {
    it("formats execution result for LLM consumption", () => {
      const result: PlanExecutionResult = {
        plan: {
          originalQuery: "test question",
          intent: "lookup",
          steps: [{ id: "s1", query: "q", source: "violations", reason: "r" }],
          synthesisPrompt: "Answer clearly",
        },
        stepResults: [
          { stepId: "s1", source: "violations", data: "found 3 violations", success: true, latencyMs: 150 },
        ],
        mergedContext: "## Source: violations\nfound 3 violations",
        totalLatencyMs: 200,
      };

      const context = buildSynthesisContext(result);
      expect(context).toContain("test question");
      expect(context).toContain("✓");
      expect(context).toContain("found 3 violations");
      expect(context).toContain("Answer clearly");
    });
  });
});
