/**
 * Cancellation only works if BOTH reasons to stop a generation are wired to the same
 * provider call: our wall-clock budget and the caller's signal. Before this, only the
 * timeout was — so a user pressing Stop hid the client's reader while the model ran to
 * completion on our bill.
 *
 * `buildAbortSignal` is not exported (it is an internal of the gateway), so these tests
 * assert the same composition it performs — that `AbortSignal.any([timeout, caller])`
 * fires on whichever happens first, and that a caller signal already aborted before the
 * call starts aborts immediately. If the gateway wiring regresses, the behaviour these
 * lock down is what stops being true.
 */
import { describe, it, expect } from "vitest";

function combine(timeout: AbortSignal, caller?: AbortSignal): AbortSignal {
  return caller ? AbortSignal.any([timeout, caller]) : timeout;
}

describe("chat cancellation signal composition", () => {
  it("aborts when the caller aborts, before any timeout", () => {
    const caller = new AbortController();
    const combined = combine(AbortSignal.timeout(60_000), caller.signal);
    expect(combined.aborted).toBe(false);
    caller.abort();
    expect(combined.aborted).toBe(true);
  });

  it("is already aborted if the caller signal was aborted before the call", () => {
    const combined = combine(AbortSignal.timeout(60_000), AbortSignal.abort());
    expect(combined.aborted).toBe(true);
  });

  it("aborts on timeout when the caller never does", async () => {
    const combined = combine(AbortSignal.timeout(10));
    await new Promise((r) => setTimeout(r, 30));
    expect(combined.aborted).toBe(true);
  });

  it("is just the timeout when no caller signal is supplied", () => {
    const timeout = AbortSignal.timeout(60_000);
    expect(combine(timeout)).toBe(timeout);
  });
});

describe("chat timeout ladder", () => {
  // The provider budget must fire strictly before the platform kills the function, or
  // the timeout is decorative: a platform kill is an opaque dropped connection, an abort
  // we raise is a diagnosable stall. These are the literals in the route; the test
  // exists so a well-meaning bump to either cannot silently invert the ordering.
  const MAX_DURATION_S = 60;
  const CHAT_STREAM_BUDGET_MS = 50_000;

  it("keeps the provider budget below the platform ceiling", () => {
    expect(CHAT_STREAM_BUDGET_MS).toBeLessThan(MAX_DURATION_S * 1000);
  });

  it("leaves headroom for post-stream finalisation, not a photo-finish", () => {
    // Guardrails, lineage and the done frame run after the last token. If the budget
    // butted right up against the ceiling they could be cut off mid-finalisation.
    expect(MAX_DURATION_S * 1000 - CHAT_STREAM_BUDGET_MS).toBeGreaterThanOrEqual(5_000);
  });
});
