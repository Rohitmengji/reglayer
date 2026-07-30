/**
 * Saving a conversation used to delete every row and recreate all of them, so a single
 * new turn rewrote up to 200 rows and the cost scaled with length, not change — the
 * shape that blew the transaction budget in production. This diff computes the minimal
 * writes instead. It is the load-bearing part, so every branch is pinned here: the
 * common append, feedback flips, edits (same id, new content), regenerate/truncate, and
 * the mixed case. A wrong diff loses messages or duplicates them, so these are exact.
 */
import { describe, it, expect } from "vitest";
import { diffMessages, type DiffableMessage } from "@/lib/ai/chat/message-diff";

const m = (id: string, content: string, feedback = 0, role = "assistant"): DiffableMessage =>
  ({ id, role, content, feedback });

describe("diffMessages", () => {
  it("inserts only the new messages on a normal turn", () => {
    const existing = [m("u1", "hi", 0, "user"), m("a1", "hello")];
    const incoming = [...existing, m("u2", "more", 0, "user"), m("a2", "reply")];
    const d = diffMessages(existing, incoming);
    expect(d.toInsert.map((x) => x.id)).toEqual(["u2", "a2"]);
    expect(d.toUpdate).toEqual([]);
    expect(d.toDeleteIds).toEqual([]);
  });

  it("does nothing when an identical conversation is re-sent (debounced re-sync)", () => {
    const existing = [m("u1", "hi", 0, "user"), m("a1", "hello")];
    const d = diffMessages(existing, [m("u1", "hi", 0, "user"), m("a1", "hello")]);
    expect(d.toInsert).toEqual([]);
    expect(d.toUpdate).toEqual([]);
    expect(d.toDeleteIds).toEqual([]);
  });

  it("updates only the row whose feedback flipped", () => {
    const existing = [m("u1", "hi", 0, "user"), m("a1", "hello", 0)];
    const d = diffMessages(existing, [m("u1", "hi", 0, "user"), m("a1", "hello", 1)]);
    expect(d.toUpdate.map((x) => x.id)).toEqual(["a1"]);
    expect(d.toInsert).toEqual([]);
    expect(d.toDeleteIds).toEqual([]);
  });

  it("updates a message whose content changed (edit-and-resend keeps the id)", () => {
    const existing = [m("u1", "old question", 0, "user"), m("a1", "old answer")];
    // Edit truncates the assistant reply and rewrites the user message, same id.
    const incoming = [m("u1", "new question", 0, "user")];
    const d = diffMessages(existing, incoming);
    expect(d.toUpdate.map((x) => x.id)).toEqual(["u1"]);
    expect(d.toDeleteIds).toEqual(["a1"]);
    expect(d.toInsert).toEqual([]);
  });

  it("deletes the tail a regenerate removed and inserts the new reply", () => {
    const existing = [m("u1", "q", 0, "user"), m("a1", "first answer")];
    // Regenerate drops a1, adds a2.
    const incoming = [m("u1", "q", 0, "user"), m("a2", "second answer")];
    const d = diffMessages(existing, incoming);
    expect(d.toDeleteIds).toEqual(["a1"]);
    expect(d.toInsert.map((x) => x.id)).toEqual(["a2"]);
    expect(d.toUpdate).toEqual([]);
  });

  it("handles insert, update and delete together", () => {
    const existing = [
      m("u1", "q1", 0, "user"),
      m("a1", "a1", 0),
      m("a-stale", "to remove"),
    ];
    const incoming = [
      m("u1", "q1", 0, "user"),   // unchanged
      m("a1", "a1", 1),            // feedback changed -> update
      m("u2", "q2", 0, "user"),   // new -> insert
    ];
    const d = diffMessages(existing, incoming);
    expect(d.toUpdate.map((x) => x.id)).toEqual(["a1"]);
    expect(d.toInsert.map((x) => x.id)).toEqual(["u2"]);
    expect(d.toDeleteIds).toEqual(["a-stale"]);
  });

  it("inserts everything into an empty conversation", () => {
    const d = diffMessages([], [m("u1", "hi", 0, "user"), m("a1", "hello")]);
    expect(d.toInsert.map((x) => x.id)).toEqual(["u1", "a1"]);
    expect(d.toUpdate).toEqual([]);
    expect(d.toDeleteIds).toEqual([]);
  });

  it("deletes everything when the client clears the conversation", () => {
    const existing = [m("u1", "hi", 0, "user"), m("a1", "hello")];
    const d = diffMessages(existing, []);
    expect(d.toDeleteIds).toEqual(["u1", "a1"]);
    expect(d.toInsert).toEqual([]);
    expect(d.toUpdate).toEqual([]);
  });

  it("treats a role change as an update, defensively", () => {
    const existing = [m("x1", "text", 0, "assistant")];
    const d = diffMessages(existing, [m("x1", "text", 0, "user")]);
    expect(d.toUpdate.map((x) => x.id)).toEqual(["x1"]);
  });

  it("applied end-to-end, the diff reproduces the client's exact set", () => {
    // The invariant that matters: existing MINUS deletes PLUS inserts, with updates
    // overlaid, equals incoming. If this holds for an arbitrary case, no message is
    // lost or duplicated.
    const existing = [m("k", "keep"), m("e", "old", 0), m("d", "drop"), m("u", "before", 0, "user")];
    const incoming = [m("k", "keep"), m("e", "new", 1), m("u", "before", 0, "user"), m("n", "new msg")];
    const d = diffMessages(existing, incoming);

    const result = new Map(existing.map((x) => [x.id, { ...x }]));
    for (const id of d.toDeleteIds) result.delete(id);
    for (const x of d.toInsert) result.set(x.id, { ...x });
    for (const x of d.toUpdate) result.set(x.id, { ...x });

    const reproduced = [...result.values()].sort((a, b) => a.id.localeCompare(b.id));
    const expected = [...incoming].sort((a, b) => a.id.localeCompare(b.id));
    expect(reproduced).toEqual(expected);
  });
});
