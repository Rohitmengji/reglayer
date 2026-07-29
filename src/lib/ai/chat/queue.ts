/**
 * RegLayer — Chat Queue Engine (pure logic)
 *
 * WHY A SEPARATE MODULE: the scheduling rules — who may run, what may be queued,
 * how long a prompt will wait — are decisions, not React state. Kept pure they can be
 * exhaustively tested without mounting a component or mocking a network.
 *
 * SCOPE: this module does NOT own the response state machine. A run's lifecycle
 * (sending → generating → streaming → completed) belongs to `message-status.ts`.
 * The queue only reacts to the OUTCOME of a run and decides what happens next.
 */

import type { ChatResponseStatus } from "./message-status";

/** A prompt waiting for its turn. */
export interface QueuedPrompt {
  id: string;
  content: string;
  createdAt: number;
}

/**
 * Why the queue stopped draining.
 *
 * Every reason here requires an EXPLICIT user decision (retry or skip) before more
 * prompts run. Auto-resuming after a failure would answer follow-up questions against
 * a conversation that never happened — the follow-ups were written expecting context
 * the failed turn was supposed to create.
 *
 * `persistence` is different in kind: the answer succeeded but could not be stored.
 * Continuing would generate more answers that also cannot be stored, widening the loss
 * window and spending tokens on output that will not survive a refresh.
 *
 * `user` is a deliberate hold. It is the only reason that is not a problem report, so
 * the UI must offer "Resume" rather than "Skip" — there is no failed turn to skip past.
 */
export type QueuePauseReason = "failed" | "cancelled" | "interrupted" | "persistence" | "user";

/** Observable state of the queue, derived from ownership and pause reason. */
export type QueueStatus = "idle" | "running" | "paused";

export const MAX_QUEUED_PROMPTS = 5;

/** Outcomes that leave a turn recoverable, so the user can retry the same prompt. */
const RECOVERABLE: ReadonlySet<string> = new Set<ChatResponseStatus>([
  "failed",
  "cancelled",
  "interrupted",
]);

export function isRecoverableStatus(status: ChatResponseStatus | undefined): boolean {
  return status !== undefined && RECOVERABLE.has(status);
}

/**
 * Map a non-successful run outcome to a pause reason.
 * Returns null for outcomes that should not stop the queue.
 */
export function pauseReasonForOutcome(outcome: string): QueuePauseReason | null {
  return outcome === "failed" || outcome === "cancelled" || outcome === "interrupted"
    ? outcome
    : null;
}

export function queueStatusOf(
  hasOwner: boolean,
  pauseReason: QueuePauseReason | null,
): QueueStatus {
  // Ownership wins: a run in flight is "running" even if a previous pause is recorded.
  if (hasOwner) return "running";
  return pauseReason ? "paused" : "idle";
}

// ── Admission control ────────────────────────────────────────────────────────

export type EnqueueRejection = "empty" | "duplicate" | "full";

export type EnqueueDecision =
  | { ok: true; content: string }
  | { ok: false; reason: EnqueueRejection };

/**
 * Decide whether a prompt may join the queue.
 *
 * DUPLICATE HANDLING is the interesting rule. Two prompts with identical text are
 * almost always a double submit — a second Enter keypress, a double click, or a
 * retried gesture on a slow connection. Accepting them costs the user a duplicate
 * answer and a duplicate model call. `activePrompt` is checked as well as the queue,
 * because the most common double submit is "send, then immediately send again", where
 * the first copy is already running and is therefore not in the queue at all.
 *
 * Exact (trimmed) comparison is deliberate. Fuzzy matching would reject legitimately
 * similar follow-ups, and being wrong in that direction silently drops a real question.
 */
export function decideEnqueue(
  content: string,
  queued: readonly QueuedPrompt[],
  activePrompt?: string | null,
): EnqueueDecision {
  const normalized = content.trim();
  if (!normalized) return { ok: false, reason: "empty" };

  if (activePrompt?.trim() === normalized) return { ok: false, reason: "duplicate" };
  if (queued.some((prompt) => prompt.content === normalized)) {
    return { ok: false, reason: "duplicate" };
  }

  // Capacity is checked LAST so a duplicate is reported as a duplicate even when the
  // queue happens to be full — the user gets the accurate reason for the rejection.
  if (queued.length >= MAX_QUEUED_PROMPTS) return { ok: false, reason: "full" };

  return { ok: true, content: normalized };
}

// ── Wait estimation ──────────────────────────────────────────────────────────

/** Smoothing factor for the run-duration average. Recent runs weigh more. */
const EWMA_ALPHA = 0.3;

/**
 * Fold a completed run's duration into the rolling average.
 *
 * An exponentially weighted average is used rather than a mean over all history so the
 * estimate tracks the current model and prompt size instead of being anchored by runs
 * from an hour ago.
 */
export function foldRunDuration(previousMs: number | null, sampleMs: number): number {
  if (!Number.isFinite(sampleMs) || sampleMs <= 0) return previousMs ?? 0;
  if (previousMs === null || previousMs <= 0) return sampleMs;
  return previousMs * (1 - EWMA_ALPHA) + sampleMs * EWMA_ALPHA;
}

/**
 * Estimated milliseconds until the prompt at `index` (0-based) starts producing output.
 *
 * Returns null when there is no measured history. Showing a fabricated number is worse
 * than showing nothing: users calibrate on the first estimate they see, and an invented
 * one teaches them the estimate cannot be trusted.
 *
 * The active run is counted as one full run's worth of remaining work. That
 * deliberately over-estimates — a wait that finishes early is a better experience than
 * one that silently overruns.
 */
export function estimateWaitMs(index: number, avgRunMs: number | null): number | null {
  if (avgRunMs === null || avgRunMs <= 0) return null;
  return (index + 1) * avgRunMs;
}

/** Render a wait as a short, honest label. */
export function formatWait(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `~${Math.max(seconds, 1)}s`;
  const minutes = Math.round(seconds / 60);
  return `~${minutes}m`;
}

/** Total estimated wait until the LAST pending prompt starts. */
export function estimateTotalWaitMs(
  pendingCount: number,
  avgRunMs: number | null,
): number | null {
  if (pendingCount <= 0) return null;
  return estimateWaitMs(pendingCount - 1, avgRunMs);
}

// ── Screen reader announcements ─────────────────────────────────────────

/**
 * One sentence describing the queue, for a SINGLE live region.
 *
 * WHY ONE: each assistant message previously carried its own `aria-live` region. During
 * a drain that is N regions announcing four transitions each, which buries the one fact
 * the user needs under a stream of chatter. A single region that states the whole
 * situation is both quieter and more informative.
 *
 * Returns an empty string when there is nothing worth interrupting the user for —
 * silence is the correct output for an idle, empty queue.
 */
export function queueAnnouncement(args: {
  status: QueueStatus;
  pendingCount: number;
  avgRunMs: number | null;
  pauseReason: QueuePauseReason | null;
}): string {
  const { status, pendingCount, avgRunMs, pauseReason } = args;

  if (status === "paused") {
    const cause = pauseReason === "user" ? "Queue paused" : "Queue paused after a problem";
    return pendingCount > 0
      ? `${cause}. ${pendingCount} ${pendingCount === 1 ? "prompt" : "prompts"} waiting. Choose retry or skip to continue.`
      : `${cause}.`;
  }

  if (status === "running") {
    if (pendingCount === 0) return "Answering your question.";
    const total = estimateTotalWaitMs(pendingCount, avgRunMs);
    const suffix = total === null ? "" : ` Estimated ${formatWait(total).replace("~", "")} for all.`;
    return `Answering. ${pendingCount} ${pendingCount === 1 ? "prompt" : "prompts"} queued.${suffix}`;
  }

  return pendingCount > 0 ? `${pendingCount} queued, not running.` : "";
}
