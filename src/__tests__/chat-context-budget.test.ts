/**
 * Context budget engine.
 *
 * The properties under test are the ones whose violation is silent: exceeding a model's
 * real window, severing a question from its answer, and emitting context out of order.
 * All three produce confidently wrong answers rather than errors.
 */

import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  groupIntoTurns,
  inputBudgetFor,
  scoreRelevance,
  selectContext,
  type ContextMessage,
} from "@/lib/ai/chat/context-budget";

/** 1 token per character keeps arithmetic in the tests obvious. */
const countTokens = (text: string) => text.length;

function user(content: string): ContextMessage {
  return { role: "user", content };
}
function assistant(content: string): ContextMessage {
  return { role: "assistant", content };
}

describe("token budgeting", () => {
  it("derives the budget from the model window, not a constant", () => {
    // The old guard hardcoded 100k regardless of the routed model.
    const small = inputBudgetFor({ contextWindow: 32_000, reserveOutputTokens: 4_000 });
    const large = inputBudgetFor({ contextWindow: 1_000_000, reserveOutputTokens: 4_000 });

    expect(small).toBeLessThan(large);
    expect(small).toBeLessThan(32_000);
  });

  it("reserves room for the completion", () => {
    const withReserve = inputBudgetFor({ contextWindow: 100_000, reserveOutputTokens: 20_000 });
    const withoutReserve = inputBudgetFor({ contextWindow: 100_000, reserveOutputTokens: 0 });

    expect(withoutReserve - withReserve).toBe(20_000);
  });

  it("holds back a margin because the estimate is approximate", () => {
    // Under-estimating is a hard provider failure; over-estimating only wastes window.
    const budget = inputBudgetFor({ contextWindow: 1_000, reserveOutputTokens: 0 });
    expect(budget).toBeLessThan(1_000);
  });

  it("never returns a negative budget when the reserve exceeds the window", () => {
    expect(inputBudgetFor({ contextWindow: 1_000, reserveOutputTokens: 5_000 })).toBe(0);
  });

  it("estimates tokens conservatively", () => {
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });
});

describe("turn grouping", () => {
  it("keeps a question and its answer together", () => {
    const turns = groupIntoTurns([
      user("Q1"), assistant("A1"),
      user("Q2"), assistant("A2"),
    ], countTokens);

    expect(turns).toHaveLength(2);
    expect(turns[0].messages.map((m) => m.content)).toEqual(["Q1", "A1"]);
  });

  it("keeps multi-part answers in the same turn", () => {
    const turns = groupIntoTurns([
      user("Q1"), assistant("A1a"), assistant("A1b"),
    ], countTokens);

    expect(turns).toHaveLength(1);
    expect(turns[0].messages).toHaveLength(3);
  });

  it("does not discard a leading assistant message", () => {
    const turns = groupIntoTurns([assistant("greeting"), user("Q1")], countTokens);
    expect(turns.flatMap((t) => t.messages)).toHaveLength(2);
  });
});

describe("relevance ranking", () => {
  it("scores a topically related turn above an unrelated one", () => {
    const query = "what contrast ratio does SC 1.4.3 require";
    expect(scoreRelevance(query, "SC 1.4.3 requires a 4.5:1 contrast ratio"))
      .toBeGreaterThan(scoreRelevance(query, "thanks, that was helpful"));
  });

  it("weights identifiers more heavily than ordinary words", () => {
    // "1.4.3" is far more discriminating than "require".
    const query = "explain 1.4.3";
    expect(scoreRelevance(query, "criterion 1.4.3 explained"))
      .toBeGreaterThan(scoreRelevance(query, "explain something else"));
  });

  it("ignores stop words so common phrasing does not fake relevance", () => {
    expect(scoreRelevance("what is the of and to", "the of and to what is")).toBe(0);
  });
});

describe("context selection", () => {
  const budget = { contextWindow: 100, reserveOutputTokens: 0, safetyMarginRatio: 0 };

  it("never exceeds the input budget", () => {
    const history = Array.from({ length: 40 }, (_, i) =>
      i % 2 === 0 ? user(`Q${i}`.padEnd(10, "x")) : assistant(`A${i}`.padEnd(10, "y")),
    );

    const result = selectContext({
      system: "SYS".padEnd(20, "s"),
      history,
      budget,
      countTokens,
    });

    expect(result.usedTokens).toBeLessThanOrEqual(result.inputBudget);
  });

  it("always keeps the most recent turn", () => {
    const history = [
      user("old question".padEnd(30, "x")), assistant("old answer".padEnd(30, "y")),
      user("LATEST"), assistant("LATEST ANSWER"),
    ];

    const result = selectContext({ system: "SYS", history, budget, countTokens });
    const contents = result.messages.map((m) => m.content);

    expect(contents).toContain("LATEST");
  });

  it("never emits half a turn", () => {
    const history = [
      user("Q1".padEnd(25, "x")), assistant("A1".padEnd(25, "y")),
      user("Q2".padEnd(25, "x")), assistant("A2".padEnd(25, "y")),
      user("Q3"), assistant("A3"),
    ];

    const result = selectContext({ system: "S", history, budget, countTokens });
    const body = result.messages.slice(1);

    // A question without its answer tells the model it was never answered.
    for (let i = 0; i < body.length; i += 1) {
      if (body[i].role === "user") {
        expect(body[i + 1]?.role).toBe("assistant");
      }
    }
  });

  it("preserves chronological order even when selection is relevance-driven", () => {
    const history = [
      user("contrast ratio 1.4.3 question"), assistant("about 1.4.3"),
      user("unrelated chatter here"), assistant("sure thing"),
      user("more about 1.4.3 contrast"), assistant("final"),
    ];

    const result = selectContext({
      system: "S",
      history,
      budget: { contextWindow: 200, reserveOutputTokens: 0, safetyMarginRatio: 0 },
      countTokens,
    });

    const indices = result.messages.slice(1).map((m) => history.findIndex((h) => h.content === m.content));
    const sorted = [...indices].sort((a, b) => a - b);
    expect(indices).toEqual(sorted);
  });

  it("prefers a relevant old turn over irrelevant recent filler", () => {
    const history = [
      user("SC 1.4.3 contrast requirement"), assistant("4.5 to 1"),
      user("ok thanks"), assistant("you are welcome"),
      user("weather chat"), assistant("sunny"),
      user("remind me about 1.4.3 contrast"), assistant("pending"),
    ];

    const result = selectContext({
      system: "S",
      history,
      // Sized so exactly ONE older turn fits — forcing a genuine relevance choice.
      budget: { contextWindow: 80, reserveOutputTokens: 0, safetyMarginRatio: 0 },
      pinnedRecentTurns: 1,
      countTokens,
    });

    const contents = result.messages.map((m) => m.content).join(" ");
    expect(contents).toContain("SC 1.4.3 contrast requirement");
    expect(contents).not.toContain("sunny");
  });

  it("reports dropped turns so they can be summarised", () => {
    const history = Array.from({ length: 20 }, (_, i) =>
      i % 2 === 0 ? user(`Q${i}`.padEnd(15, "x")) : assistant(`A${i}`.padEnd(15, "y")),
    );

    const result = selectContext({ system: "S", history, budget, countTokens });

    expect(result.droppedTurns.length).toBeGreaterThan(0);
    // Dropped turns are the input to summarisation, not silently lost.
    expect(result.droppedTurns[0].messages.length).toBeGreaterThan(0);
  });

  it("flags overflow instead of sending a mangled prompt", () => {
    const result = selectContext({
      system: "S".repeat(500),
      history: [user("question"), assistant("answer")],
      budget: { contextWindow: 100, reserveOutputTokens: 0, safetyMarginRatio: 0 },
      countTokens,
    });

    // The caller must fail loudly: no trimming can rescue this.
    expect(result.overflow).toBe(true);
  });

  it("handles an empty history without crashing", () => {
    const result = selectContext({ system: "S", history: [], budget, countTokens });
    expect(result.messages).toHaveLength(1);
    expect(result.overflow).toBe(false);
  });
});
