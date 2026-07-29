/**
 * Tests for the chat feedback → learning-system bridge.
 *
 * WHY THIS MATTERS:
 *   In-app thumbs up/down were written to ChatMessage.feedback and nowhere else,
 *   while the learning and intelligence engines read FeedbackEntry — a table only
 *   /api/v1/evaluate (the public API) ever wrote to. Every rating from a real user
 *   was stored and never read by the system built to learn from it.
 *
 *   The bridge is a DIFF, not a scan, and that is the whole difficulty. The client
 *   debounces and re-sends the entire conversation on every save, so "this message
 *   has a rating" is not the same as "this message was just rated". Recording on
 *   presence would create a duplicate FeedbackEntry per save and quietly poison the
 *   quality metrics the bridge exists to feed.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { collectRatingTransitions } from "@/lib/ai/learning/rating-transitions";

type Msg = { id: string; role: "user" | "assistant"; content: string; feedback: number };

const convo = (...feedback: number[]): Msg[] => [
  { id: "u1", role: "user", content: "What is SC 1.4.3?", feedback: 0 },
  { id: "a1", role: "assistant", content: "Contrast (Minimum) requires 4.5:1.", feedback: feedback[0] ?? 0 },
  { id: "u2", role: "user", content: "And for large text?", feedback: 0 },
  { id: "a2", role: "assistant", content: "3:1 for large text.", feedback: feedback[1] ?? 0 },
];

describe("collectRatingTransitions", () => {
  it("records a newly applied rating", () => {
    const result = collectRatingTransitions(convo(1), new Map());

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ messageId: "a1", rating: 1 });
  });

  it("does NOT re-record a rating that was already stored", () => {
    // The re-sync case: same rating arrives again on the next debounced save.
    const result = collectRatingTransitions(convo(1), new Map([["a1", 1]]));

    expect(result).toEqual([]);
  });

  it("records a rating that flipped", () => {
    const result = collectRatingTransitions(convo(-1), new Map([["a1", 1]]));

    expect(result).toHaveLength(1);
    expect(result[0].rating).toBe(-1);
  });

  it("ignores a retraction back to neutral", () => {
    // Un-clicking a thumb is a withdrawal, not a judgement — there is nothing to learn.
    const result = collectRatingTransitions(convo(0), new Map([["a1", 1]]));

    expect(result).toEqual([]);
  });

  it("attaches the preceding user turn so the rating has a subject", () => {
    const result = collectRatingTransitions(convo(0, -1), new Map());

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      messageId: "a2",
      query: "And for large text?",
      response: "3:1 for large text.",
    });
  });

  it("never records ratings on user messages", () => {
    const messages: Msg[] = [
      { id: "u1", role: "user", content: "hello", feedback: 1 },
    ];

    expect(collectRatingTransitions(messages, new Map())).toEqual([]);
  });

  it("handles several transitions in one save", () => {
    const result = collectRatingTransitions(convo(1, -1), new Map());

    expect(result.map((r) => [r.messageId, r.rating])).toEqual([["a1", 1], ["a2", -1]]);
  });

  it("records only the changed message when another rating is unchanged", () => {
    const result = collectRatingTransitions(convo(1, -1), new Map([["a1", 1]]));

    expect(result).toHaveLength(1);
    expect(result[0].messageId).toBe("a2");
  });

  it("tolerates an assistant reply with no preceding user turn", () => {
    const messages: Msg[] = [
      { id: "a1", role: "assistant", content: "orphaned reply", feedback: 1 },
    ];

    const result = collectRatingTransitions(messages, new Map());

    expect(result).toHaveLength(1);
    expect(result[0].query).toBe("");
  });

  it("truncates long content so a rating cannot bloat the row", () => {
    const messages: Msg[] = [
      { id: "u1", role: "user", content: "q".repeat(5000), feedback: 0 },
      { id: "a1", role: "assistant", content: "r".repeat(9000), feedback: 1 },
    ];

    const result = collectRatingTransitions(messages, new Map());

    expect(result[0].response.length).toBe(4000);
    expect(result[0].query.length).toBe(2000);
  });
});
