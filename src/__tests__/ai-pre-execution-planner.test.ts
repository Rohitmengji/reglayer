/**
 * Pre-execution planning.
 *
 * The highest-stakes assertions here are the NEGATIVE ones. A planner that skips a
 * model call it should have made produces a confidently useless answer, which is worse
 * than any latency it saved. So the deterministic path is tested primarily for what it
 * refuses to handle.
 */

import { describe, it, expect, vi } from "vitest";

// `planner/engine` is server-only; the planner itself is pure, so the guard is stubbed
// exactly as the existing query-planner test does.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/ai/gateway", () => ({ complete: vi.fn(), embed: vi.fn() }));

import { planRequest, tryDirectAnswer } from "@/lib/ai/planner/pre-execution";

describe("deterministic answers", () => {
  it("answers a conformance-level question from authoritative data", () => {
    const answer = tryDirectAnswer("What level is SC 1.4.3?");

    expect(answer).not.toBeNull();
    // A model asked this can invent an answer; the table cannot.
    expect(answer?.text).toContain("Level AA");
    expect(answer?.text).toContain("Contrast (Minimum)");
  });

  it("includes the WCAG version, which is what dates a criterion", () => {
    expect(tryDirectAnswer("which version is 2.5.8")?.text).toContain("2.2");
  });

  it.each([
    ["remediation", "How do I fix 1.4.3?"],
    ["rationale", "Why does 1.4.3 matter?"],
    ["examples", "Show me a code example for 1.4.3"],
    ["personal context", "Does our site pass 1.4.3?"],
    ["prioritisation", "Should we prioritise 1.4.3?"],
    ["comparison", "How does 1.4.3 differ from 1.4.11?"],
  ])("declines %s, which needs reasoning", (_label, query) => {
    // Answering these from a lookup table would be worse than any latency saved.
    expect(tryDirectAnswer(query)).toBeNull();
  });

  it("declines a criterion that does not exist", () => {
    // This must reach the model with retrieval, so the fact-checker can flag the
    // invented criterion rather than a lookup quietly returning nothing.
    expect(tryDirectAnswer("What level is SC 1.4.20?")).toBeNull();
  });

  it("declines an attribute question with no criterion reference", () => {
    expect(tryDirectAnswer("What level should we target?")).toBeNull();
  });

  it("declines free-form prose that merely mentions a number", () => {
    expect(tryDirectAnswer("we had 1.4.3 issues across the site")).toBeNull();
  });
});

describe("execution planning", () => {
  it("routes a factual criterion question away from the model entirely", () => {
    const plan = planRequest("What level is SC 1.4.3?");

    expect(plan.strategy).toBe("direct-answer");
    expect(plan.directAnswer).toBeDefined();
    expect(plan.needsRetrieval).toBe(false);
    expect(plan.reason).toContain("1.4.3");
  });

  it("does not run a vector search for a greeting", () => {
    const plan = planRequest("hi");

    // Every request previously performed retrieval, a memory query, and a profile query.
    expect(plan.strategy).toBe("single-pass");
    expect(plan.needsRetrieval).toBe(false);
    expect(plan.needsMemory).toBe(false);
    expect(plan.tier).toBe("fast");
  });

  it("skips personal memory for a pure reference question", () => {
    const plan = planRequest("What does WCAG require for non-text contrast?");

    // Knowing the user's tech stack does not change what a criterion requires.
    expect(plan.needsRetrieval).toBe(true);
    expect(plan.needsMemory).toBe(false);
    expect(plan.reason).toBe("reference-question");
  });

  it("enables tools only when the user asks about their own data", () => {
    expect(planRequest("What are our critical violations?").needsTools).toBe(true);
    expect(planRequest("What does WCAG say about focus order?").needsTools).toBe(false);
  });

  it("keeps memory when a question mixes reference with personal context", () => {
    const plan = planRequest("Does our checkout page meet WCAG contrast rules?");
    expect(plan.needsMemory).toBe(true);
  });

  it("escalates a multi-step request to decomposition", () => {
    const plan = planRequest("Find our critical violations and then suggest fixes");

    expect(plan.strategy).toBe("decomposed");
    expect(plan.tier).toBe("advanced");
  });

  it("escalates analysis to the strongest tier", () => {
    expect(planRequest("Why has our accessibility score been dropping?").tier).toBe("advanced");
  });

  it("keeps simple lookups on the cheap tier", () => {
    expect(planRequest("List the scans from last week").tier).toBe("fast");
  });

  it("always explains its choice, so routing is auditable", () => {
    for (const query of ["hi", "What level is 1.4.3?", "Why did our score drop?"]) {
      expect(planRequest(query).reason.length).toBeGreaterThan(0);
    }
  });

  it("plans without any I/O, so planning cannot become the cost it avoids", () => {
    // Synchronous by construction: a planner that awaits has defeated its own purpose.
    const plan = planRequest("What level is SC 1.4.3?");
    expect(plan).not.toBeInstanceOf(Promise);
  });
});
