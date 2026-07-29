/**
 * RegLayer — AI Pipeline Runner
 *
 * WHY THIS EXISTS: the chat route executes thirteen stages — validation, safety,
 * intent, context, memory, RAG, tools, prompt construction, invocation, output
 * validation, formatting, persistence — as one ~400-line function with early
 * `return new Response(...)` scattered through it. Nothing between the first line and
 * the last is reachable from a test without a live database, a session, and a model.
 *
 * That is not a stylistic complaint. Every defect found in this pipeline so far
 * survived precisely because no stage had a contract:
 *   - analytics and usage fired BEFORE the first token streamed
 *   - the token guard compared against a hardcoded constant and never fired
 *   - `dynamicMaxTokens` was computed, logged, and then discarded
 * All three are invisible in a monolith and obvious in a stage with a signature.
 *
 * DESIGN: stages are accumulator functions over a shared context. Each returns either
 * an updated context or a HALT. Halting is a first-class result rather than an early
 * return, which is what makes "does this input get rejected at safety?" a unit test
 * instead of an integration test.
 */

/** A stage may stop the pipeline. This replaces scattered early returns. */
export interface Halt {
  /** Stage that halted. */
  stage: string;
  /** Machine-readable cause, for telemetry and tests. */
  reason: string;
  /** HTTP status the route should return. */
  status: number;
  /** Message safe to show a user. Never raw internal detail. */
  message: string;
}

export type StageOutcome<Ctx> =
  | { ok: true; context: Ctx }
  | { ok: false; halt: Halt };

export interface Stage<Ctx> {
  name: string;
  run: (context: Ctx) => Promise<StageOutcome<Ctx>> | StageOutcome<Ctx>;
}

export interface StageTiming {
  name: string;
  durationMs: number;
  halted: boolean;
}

export type PipelineResult<Ctx> =
  | { ok: true; context: Ctx; timings: StageTiming[] }
  | { ok: false; halt: Halt; timings: StageTiming[] };

/** Convenience constructors so stages read as intent rather than object literals. */
export function proceed<Ctx>(context: Ctx): StageOutcome<Ctx> {
  return { ok: true, context };
}

export function halt<Ctx>(halt: Halt): StageOutcome<Ctx> {
  return { ok: false, halt };
}

export interface RunPipelineOptions {
  /**
   * Called after every stage, halted or not.
   *
   * Per-stage timing is the observability the monolith cannot provide: today a slow
   * chat response is one number, and there is no way to tell retrieval from generation.
   */
  onStageComplete?: (timing: StageTiming) => void;
  now?: () => number;
}

/**
 * Execute stages in order, stopping at the first halt.
 *
 * A stage that throws is converted into a halt rather than propagating. An unhandled
 * exception in one stage should produce a defined failure, not a 500 that loses the
 * trace of which stage failed.
 */
export async function runPipeline<Ctx>(
  stages: readonly Stage<Ctx>[],
  initial: Ctx,
  options: RunPipelineOptions = {},
): Promise<PipelineResult<Ctx>> {
  const now = options.now ?? (() => Date.now());
  const timings: StageTiming[] = [];
  let context = initial;

  for (const stage of stages) {
    const startedAt = now();
    let outcome: StageOutcome<Ctx>;

    try {
      outcome = await stage.run(context);
    } catch (error) {
      outcome = {
        ok: false,
        halt: {
          stage: stage.name,
          reason: error instanceof Error ? error.name : "unknown-error",
          status: 500,
          message: "Something went wrong while preparing this response.",
        },
      };
    }

    const timing: StageTiming = {
      name: stage.name,
      durationMs: now() - startedAt,
      halted: !outcome.ok,
    };
    timings.push(timing);
    options.onStageComplete?.(timing);

    if (!outcome.ok) return { ok: false, halt: outcome.halt, timings };
    context = outcome.context;
  }

  return { ok: true, context, timings };
}
