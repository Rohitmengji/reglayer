/**
 * RegLayer — Deterministic Completion Sequence
 *
 * WHY: when a run completes, several things must happen before the next queued prompt
 * starts. Previously they happened concurrently, in the wrong order, or not at all:
 *
 *   - Analytics and usage were recorded on the SERVER before the first token streamed,
 *     so a run that died mid-stream was still counted and metered as a completed chat.
 *   - The conversation was persisted by a 3-second debounce on the CLIENT, i.e. after
 *     the next prompt had already started. During a queue drain the debounce never
 *     fired at all, because each new run reset the timer.
 *
 * This module makes the sequence explicit, ordered, and awaited. Steps run strictly
 * one at a time; a step never begins until the previous one has settled.
 *
 * FAILURE MODEL — forward recovery, never rollback:
 * A completed answer has already been streamed to the user and its tokens are already
 * paid for. There is no compensating action that un-spends an LLM call or un-reads an
 * answer, so "rollback" is not available in principle. Recovery is therefore retry of
 * an IDEMPOTENT write, and the only real decision is whether a failed step should stop
 * the queue.
 */

/** What a failed step does to the queue once its retries are exhausted. */
export type FailurePolicy = "pause" | "continue";

export interface CompletionStep {
  name: string;
  /**
   * `pause` for steps whose failure means later runs would fail the same way or
   * compound data loss. `continue` for steps that are observability-only, where
   * blocking a user's queue is a worse outcome than a gap in a metric.
   */
  policy: FailurePolicy;
  /** Total attempts, including the first. */
  maxAttempts: number;
  /** Must reject to signal failure. */
  run: (attempt: number) => Promise<void>;
}

export interface StepReport {
  name: string;
  outcome: "ok" | "failed";
  attempts: number;
}

export interface CompletionReport {
  /** False only when a `pause`-policy step exhausted its attempts. */
  ok: boolean;
  failedStep?: string;
  steps: StepReport[];
}

/** Exponential backoff between attempts. Kept short: a user is waiting on the queue. */
export function backoffMs(attempt: number): number {
  return Math.min(200 * 2 ** (attempt - 1), 2_000);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Execute steps strictly in order, awaiting each to completion before starting the next.
 *
 * Returns as soon as a `pause`-policy step fails, so no later step can observe or act
 * on a completion that was not durably recorded.
 */
export async function runCompletionSequence(
  steps: readonly CompletionStep[],
  options: { sleep?: (ms: number) => Promise<void> } = {},
): Promise<CompletionReport> {
  const sleep = options.sleep ?? defaultSleep;
  const reports: StepReport[] = [];

  for (const step of steps) {
    let attempts = 0;
    let succeeded = false;

    while (attempts < step.maxAttempts) {
      attempts += 1;
      try {
        await step.run(attempts);
        succeeded = true;
        break;
      } catch {
        // Backoff only BETWEEN attempts — never after the last one, which would delay
        // the queue for no benefit.
        if (attempts < step.maxAttempts) await sleep(backoffMs(attempts));
      }
    }

    reports.push({ name: step.name, outcome: succeeded ? "ok" : "failed", attempts });

    if (!succeeded && step.policy === "pause") {
      return { ok: false, failedStep: step.name, steps: reports };
    }
  }

  return { ok: true, steps: reports };
}
