/**
 * RegLayer — Chat Run Recovery
 *
 * THE BUG THIS EXISTS TO FIX: a run's worker lives in the page. When the page dies —
 * refresh, crash, close, navigation — the worker dies with it, but the message it was
 * writing is already persisted in a NON-TERMINAL status.
 *
 * On reload that produced a permanent dead end:
 *   - `isStreaming` is not persisted, so the UI is not "generating"…
 *   - …but the message status is still `streaming`, so it renders a spinner forever.
 *   - The recovery bar keys off recoverable statuses and `streaming` is not one, so no
 *     recovery affordance appeared.
 *   - `retryLastResponse` refuses for the same reason.
 * The user was left with a permanently spinning answer and no way out.
 *
 * DESIGN: rehydration is the only moment where we can distinguish "a worker is writing
 * this" from "a worker WAS writing this and no longer exists". No worker survives a
 * page load, so ANY non-terminal status found at rehydration is by definition orphaned.
 */

import type { ChatResponseStatus } from "./message-status";

/**
 * Statuses that imply a live worker.
 *
 * Finding any of these at rehydration is proof of an interrupted run, because a worker
 * cannot outlive the page that created it.
 */
const NON_TERMINAL: ReadonlySet<ChatResponseStatus> = new Set([
  "sending",
  "queued",
  "generating",
  "streaming",
  "retrying",
]);

export interface RecoverableMessage {
  role: "user" | "assistant";
  content: string;
  status?: ChatResponseStatus;
}

export interface ReconcileResult<T> {
  messages: T[];
  /** Number of orphaned runs moved to a recoverable state. */
  recoveredCount: number;
  /** True when at least one orphan had partial output worth keeping. */
  preservedPartial: boolean;
}

/**
 * Move orphaned runs to `interrupted`, preserving whatever text arrived.
 *
 * WHY `interrupted` AND NOT `failed`: the distinction is real and the user acts on it.
 * `failed` means the request was rejected and retrying may fail identically.
 * `interrupted` means the answer was being produced successfully and simply did not
 * finish — retrying is very likely to work. It is also already a recoverable status, so
 * Retry and Skip light up without any further wiring.
 *
 * Partial text is NEVER discarded. A half-written answer is often still useful, and
 * silently deleting output the user already read is worse than showing it labelled as
 * incomplete.
 */
export function reconcileInterruptedRuns<T extends RecoverableMessage>(
  messages: readonly T[],
): ReconcileResult<T> {
  let recoveredCount = 0;
  let preservedPartial = false;

  const next = messages.map((message) => {
    if (message.role !== "assistant") return message;
    if (!message.status || !NON_TERMINAL.has(message.status)) return message;

    recoveredCount += 1;
    if (message.content.length > 0) preservedPartial = true;

    return { ...message, status: "interrupted" as ChatResponseStatus };
  });

  return { messages: next, recoveredCount, preservedPartial };
}

/**
 * Whether a recovered session should hold the queue rather than resume on its own.
 *
 * Always true when work is pending. Auto-resuming on page load would start billable
 * generation the user did not ask for, at a moment they may not even be looking at the
 * tab — and the prompts were written expecting context the interrupted turn never
 * produced.
 */
export function shouldPauseAfterRecovery(
  recoveredCount: number,
  pendingPrompts: number,
): boolean {
  return recoveredCount > 0 && pendingPrompts > 0;
}
