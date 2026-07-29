/**
 * Tests for ExplainabilityPanel — grounding and fact-check disclosure.
 *
 * NOTE: this is the FIRST component test in the codebase. @testing-library/react and
 * jest-dom were already installed (and jest-dom already wired into setup.ts) but had
 * zero imports, so 85 components and 95 pages had no unit-level coverage at all.
 * The pattern established here is deliberately plain: render, query by accessible
 * role/text, assert what a user can actually perceive.
 *
 * WHY THIS COMPONENT FIRST: it is the only place where the product tells a user how
 * much to trust an answer. For a compliance tool, "grounded in your data" vs "general
 * guidance" vs "an automated check flagged this" is the difference between an answer
 * that can be cited and one that cannot.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ExplainabilityPanel } from "@/components/ai/ExplainabilityPanel";
import type { MessageLineage } from "@/stores/chatStore";

// Testing Library only auto-registers cleanup when Vitest `globals` is enabled, and
// this project runs without globals. Without this, every render accumulates in the
// same document and role queries start matching multiple elements.
afterEach(cleanup);

const lineage = (overrides: Partial<MessageLineage> = {}): MessageLineage => ({
  traceId: "tr_test",
  model: "gpt-4o-mini",
  provider: "openai",
  retrievalSources: [],
  documentsRetrieved: 0,
  toolsCalled: [],
  guardrailsPassed: [],
  guardrailsWarned: [],
  cached: false,
  totalTokens: 420,
  costUsd: 0.0001,
  latencyMs: 850,
  ...overrides,
});

describe("ExplainabilityPanel — grounding disclosure", () => {
  it("states when an answer IS grounded, with the source count", () => {
    render(<ExplainabilityPanel lineage={lineage({ documentsRetrieved: 5, retrievalSources: ["hybrid-search"] })} />);

    expect(screen.getByText(/grounded in 5 sources/i)).toBeInTheDocument();
  });

  it("states when an answer is NOT grounded", () => {
    // The important half. Previously the source count rendered only when sources
    // existed, so an ungrounded answer was visually identical to a grounded one —
    // absence of a signal is not a signal.
    render(<ExplainabilityPanel lineage={lineage({ documentsRetrieved: 0 })} />);

    expect(screen.getByText(/general guidance — not from your data/i)).toBeInTheDocument();
    expect(screen.queryByText(/grounded in/i)).not.toBeInTheDocument();
  });

  it("uses singular phrasing for a single source", () => {
    render(<ExplainabilityPanel lineage={lineage({ documentsRetrieved: 1, retrievalSources: ["vector"] })} />);

    expect(screen.getByText(/grounded in 1 source(?!s)/i)).toBeInTheDocument();
  });
});

describe("ExplainabilityPanel — fact-check warnings", () => {
  it("shows a WCAG fact-check warning WITHOUT requiring expansion", () => {
    // Streaming means we cannot retract the text, so the warning must be visible by
    // default. It previously rendered only inside the collapsed panel — the single
    // most important signal required a deliberate click to discover.
    render(<ExplainabilityPanel lineage={lineage({ guardrailsWarned: ["wcag-fact-check"] })} />);

    const warning = screen.getByRole("status");

    expect(warning).toHaveTextContent(/automated check flagged this answer/i);
    expect(warning).toHaveTextContent(/cite a standard incorrectly/i);
  });

  it("treats wcag-hallucination the same as wcag-fact-check", () => {
    render(<ExplainabilityPanel lineage={lineage({ guardrailsWarned: ["wcag-hallucination"] })} />);

    expect(screen.getByRole("status")).toHaveTextContent(/cite a standard incorrectly/i);
  });

  it("falls back to generic wording for other guard warnings", () => {
    render(<ExplainabilityPanel lineage={lineage({ guardrailsWarned: ["topic-relevance"] })} />);

    const warning = screen.getByRole("status");

    expect(warning).toHaveTextContent(/review before relying on it/i);
    expect(warning).not.toHaveTextContent(/cite a standard incorrectly/i);
  });

  it("shows no warning banner when all guards passed", () => {
    render(<ExplainabilityPanel lineage={lineage({ guardrailsPassed: ["wcag-fact-check", "output-length"] })} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("tolerates guardrailsWarned being absent", () => {
    // Older persisted conversations predate this field.
    const legacy = lineage();
    delete (legacy as Partial<MessageLineage>).guardrailsWarned;

    render(<ExplainabilityPanel lineage={legacy} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("ExplainabilityPanel — disclosure control", () => {
  it("is collapsed by default and exposes its state to assistive tech", () => {
    render(<ExplainabilityPanel lineage={lineage()} />);

    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  });

  it("reports cached responses instead of a latency figure", () => {
    render(<ExplainabilityPanel lineage={lineage({ cached: true })} />);

    expect(screen.getByRole("button")).toHaveTextContent(/cached/i);
    expect(screen.getByRole("button")).not.toHaveTextContent(/850ms/);
  });
});
