/**
 * Chat telemetry.
 *
 * The two failure modes worth testing are a cardinality explosion — a free-form label
 * creating one time series per distinct value, which can take down a metrics backend —
 * and telemetry that costs the user something. Both are silent until they are severe.
 */

import { describe, it, expect, vi } from "vitest";
import {
  ChatTelemetry,
  isValidSignal,
  type ChatSignal,
} from "@/lib/ai/chat/telemetry";

/** Deterministic scheduler so batching is tested without real timers. */
function controllable() {
  const queued: (() => void)[] = [];
  return {
    schedule: (fn: () => void) => {
      queued.push(fn);
      return queued.length as unknown as ReturnType<typeof setTimeout>;
    },
    cancel: () => {},
    run: () => queued.splice(0).forEach((fn) => fn()),
  };
}

function telemetry(send: (s: ChatSignal[]) => void) {
  const clock = controllable();
  return { t: new ChatTelemetry(send, 5000, clock.schedule, clock.cancel), clock };
}

// ── Cardinality protection ───────────────────────────────────────────────────

describe("signal validation", () => {
  it("accepts a known event", () => {
    expect(isValidSignal({ kind: "event", name: "run.completed" })).toBe(true);
  });

  it("rejects an unknown event name", () => {
    // One time series per distinct name is how a metrics backend falls over.
    expect(isValidSignal({ kind: "event", name: "run.whatever" })).toBe(false);
  });

  it("rejects a free-form label value", () => {
    expect(isValidSignal({ kind: "event", name: "queue.paused", reason: "failed" })).toBe(true);
    // Permitting arbitrary values under a KNOWN key is the same bomb, better disguised.
    expect(isValidSignal({
      kind: "event",
      name: "queue.paused",
      reason: "user asked about https://example.com/very/unique/path",
    })).toBe(false);
  });

  it("never accepts anything resembling user content", () => {
    expect(isValidSignal({ kind: "event", name: "run.started", reason: "how do I fix contrast" }))
      .toBe(false);
  });

  it("rejects non-finite and negative measurements", () => {
    // NaN corrupts histogram aggregation silently.
    expect(isValidSignal({ kind: "measurement", name: "ttft_ms", value: Number.NaN })).toBe(false);
    expect(isValidSignal({ kind: "measurement", name: "ttft_ms", value: -1 })).toBe(false);
    expect(isValidSignal({ kind: "measurement", name: "ttft_ms", value: 0 })).toBe(true);
  });

  it("rejects malformed input rather than throwing", () => {
    for (const bad of [null, undefined, 42, "run.completed", {}, { kind: "other" }]) {
      expect(isValidSignal(bad)).toBe(false);
    }
  });
});

// ── Batching ─────────────────────────────────────────────────────────────────

/**
 * Simulate the browser's WebIDL receiver rule.
 *
 * `setTimeout` is an operation on Window. An unqualified call passes `undefined` as the
 * receiver and WebIDL substitutes the global, which is why `setTimeout(fn)` works.
 * Calling it as a METHOD of another object passes that object, which browsers reject
 * with "Illegal invocation". Node and jsdom do not enforce this, which is exactly why a
 * default parameter of `= setTimeout` passed every test and threw in production.
 */
function withStrictTimers(run: () => void): void {
  const realSetTimeout = globalThis.setTimeout;
  const strict = function (this: unknown, fn: () => void, ms?: number) {
    if (this !== undefined && this !== globalThis) {
      throw new TypeError("Illegal invocation");
    }
    return realSetTimeout(fn, ms);
  };

  vi.stubGlobal("setTimeout", strict);
  try {
    run();
  } finally {
    vi.unstubAllGlobals();
  }
}

describe("the default scheduler", () => {
  it("does not bind timer globals to the instance", () => {
    // Regression: `schedule = setTimeout` made `this.schedule(...)` pass the
    // ChatTelemetry instance as the receiver, throwing on the first buffered event.
    withStrictTimers(() => {
      const telemetry = new ChatTelemetry(() => {});
      expect(() => telemetry.event("run.started")).not.toThrow();
      telemetry.flush();
    });
  });

  it("still delivers a batch when constructed with defaults", () => {
    const send = vi.fn();
    const telemetry = new ChatTelemetry(send);

    telemetry.event("run.completed");
    telemetry.flush();

    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("batching", () => {
  it("sends nothing until flushed", () => {
    const send = vi.fn();
    const { t } = telemetry(send);

    t.event("run.started");

    // Telemetry must not add a request per event to a user's session.
    expect(send).not.toHaveBeenCalled();
    expect(t.pending).toBe(1);
  });

  it("coalesces a batch into one transmission", () => {
    const send = vi.fn();
    const { t, clock } = telemetry(send);

    t.event("run.started");
    t.measure("ttft_ms", 320);
    t.event("run.completed");
    clock.run();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toHaveLength(3);
  });

  it("flushes automatically once the batch cap is reached", () => {
    const send = vi.fn();
    const { t } = telemetry(send);

    for (let i = 0; i < 50; i += 1) t.event("run.started");

    // A runaway loop must not grow the buffer without bound.
    expect(send).toHaveBeenCalledTimes(1);
    expect(t.pending).toBe(0);
  });

  it("drops invalid signals without occupying a buffer slot", () => {
    const send = vi.fn();
    const { t } = telemetry(send);

    t.measure("ttft_ms", Number.NaN);

    expect(t.pending).toBe(0);
  });

  it("never surfaces a transport failure", () => {
    const { t } = telemetry(() => { throw new Error("network down"); });

    t.event("run.started");
    // Dropped metrics are strictly preferable to a degraded session.
    expect(() => t.flush()).not.toThrow();
  });

  it("does not retry a failed batch into a loop", () => {
    const send = vi.fn().mockImplementation(() => { throw new Error("down"); });
    const { t } = telemetry(send);

    t.event("run.started");
    t.flush();
    t.flush();

    expect(send).toHaveBeenCalledTimes(1);
    expect(t.pending).toBe(0);
  });

  it("is safe to flush when empty", () => {
    const send = vi.fn();
    const { t } = telemetry(send);
    t.flush();
    expect(send).not.toHaveBeenCalled();
  });

  it("does not replay a batch after sending it", () => {
    const send = vi.fn();
    const { t } = telemetry(send);

    t.event("run.started");
    t.flush();
    t.event("run.completed");
    t.flush();

    expect(send.mock.calls.map((c) => c[0].length)).toEqual([1, 1]);
  });
});
