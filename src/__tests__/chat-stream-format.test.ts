/**
 * Streaming rendering and token buffering.
 *
 * The failure modes here are silent: a buffered token dropped at the end of a stream
 * truncates an answer without any error, and an unclosed fence produces a late layout
 * shift rather than a crash. Both are pinned explicitly.
 */

import { describe, it, expect, vi } from "vitest";
import {
  hasUnterminatedFence,
  stabilizeStreamingMarkdown,
  TokenBuffer,
} from "@/lib/ai/chat/stream-format";

// ── Markdown stabilisation ───────────────────────────────────────────────────

describe("streaming markdown stabilisation", () => {
  it("detects a fence that has been opened but not closed", () => {
    expect(hasUnterminatedFence("here is code:\n```html\n<div>")).toBe(true);
    expect(hasUnterminatedFence("here is code:\n```html\n<div>\n```")).toBe(false);
  });

  it("closes a partial code block so it renders as code from the start", () => {
    const partial = "Try this:\n```html\n<button aria-label=\"Close\">";
    const stabilised = stabilizeStreamingMarkdown(partial, true);

    // Without this the block renders as paragraph text, then snaps into a dark
    // bordered block and pushes everything below it down.
    expect(stabilised.endsWith("```")).toBe(true);
  });

  it("does not glue the closing fence onto a partial line of code", () => {
    const stabilised = stabilizeStreamingMarkdown("```js\nconst x = 1", true);
    expect(stabilised).toBe("```js\nconst x = 1\n```");
  });

  it("leaves already-balanced content untouched", () => {
    const balanced = "```js\nconst x = 1;\n```\nDone.";
    expect(stabilizeStreamingMarkdown(balanced, true)).toBe(balanced);
  });

  it("never alters content once streaming has finished", () => {
    // The final DOM must come from exactly what the model sent; stabilisation is a
    // transient display concern and must not leak into stored or copied text.
    const partial = "```js\nconst x = 1";
    expect(stabilizeStreamingMarkdown(partial, false)).toBe(partial);
  });

  it("handles empty content", () => {
    expect(stabilizeStreamingMarkdown("", true)).toBe("");
  });

  it("handles multiple completed blocks followed by a new open one", () => {
    const content = "```a\n1\n```\ntext\n```b\n2";
    expect(hasUnterminatedFence(content)).toBe(true);
    expect(stabilizeStreamingMarkdown(content, true).endsWith("```")).toBe(true);
  });
});

// ── Token buffering ──────────────────────────────────────────────────────────

describe("token buffering", () => {
  it("does not bind timer globals to the instance", () => {
    // Same defect as ChatTelemetry, and worse placed: TokenBuffer sits in the streaming
    // hot path, so this would throw on the first token of every response.
    const realSetTimeout = globalThis.setTimeout;
    const strict = function (this: unknown, fn: () => void, ms?: number) {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      return realSetTimeout(fn, ms);
    };

    vi.stubGlobal("setTimeout", strict);
    try {
      const buffer = new TokenBuffer(() => {});
      expect(() => buffer.push("token")).not.toThrow();
      buffer.discard();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /** Deterministic scheduler so tests never depend on real timers. */
  function controllable() {
    const queued: (() => void)[] = [];
    const schedule = (fn: () => void) => {
      queued.push(fn);
      return queued.length as unknown as ReturnType<typeof setTimeout>;
    };
    const cancel = () => {};
    return { queued, schedule, cancel, run: () => queued.splice(0).forEach((fn) => fn()) };
  }

  it("coalesces many tokens into a single update", () => {
    const flush = vi.fn();
    const clock = controllable();
    const buffer = new TokenBuffer(flush, 16, clock.schedule, clock.cancel);

    for (const token of ["Hel", "lo ", "wor", "ld"]) buffer.push(token);
    clock.run();

    // One store write instead of four — each write re-renders and re-serialises.
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith("Hello world");
  });

  it("emits everything buffered when flushed explicitly", () => {
    const flush = vi.fn();
    const clock = controllable();
    const buffer = new TokenBuffer(flush, 16, clock.schedule, clock.cancel);

    buffer.push("trailing tokens");
    buffer.flush();

    // Without an explicit flush at stream end, the final tokens are lost and the
    // answer is silently truncated.
    expect(flush).toHaveBeenCalledWith("trailing tokens");
  });

  it("does not emit when nothing is buffered", () => {
    const flush = vi.fn();
    new TokenBuffer(flush).flush();
    expect(flush).not.toHaveBeenCalled();
  });

  it("ignores empty chunks", () => {
    const flush = vi.fn();
    const buffer = new TokenBuffer(flush);
    buffer.push("");
    buffer.flush();
    expect(flush).not.toHaveBeenCalled();
  });

  it("does not replay content after a flush", () => {
    const flush = vi.fn();
    const clock = controllable();
    const buffer = new TokenBuffer(flush, 16, clock.schedule, clock.cancel);

    buffer.push("first");
    buffer.flush();
    buffer.push("second");
    buffer.flush();

    expect(flush.mock.calls.map((c) => c[0])).toEqual(["first", "second"]);
  });

  it("drops buffered output when a run is discarded", () => {
    const flush = vi.fn();
    const buffer = new TokenBuffer(flush);

    buffer.push("abandoned");
    buffer.discard();
    buffer.flush();

    expect(flush).not.toHaveBeenCalled();
  });

  it("is safe to flush repeatedly", () => {
    const flush = vi.fn();
    const buffer = new TokenBuffer(flush);

    buffer.push("once");
    buffer.flush();
    buffer.flush();

    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("exposes what is pending, so a stream end can be reasoned about", () => {
    const clock = controllable();
    const buffer = new TokenBuffer(vi.fn(), 16, clock.schedule, clock.cancel);
    buffer.push("pending");
    expect(buffer.buffered).toBe("pending");
  });
});
