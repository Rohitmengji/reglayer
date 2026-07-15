/**
 * RegLayer — Workflow Runner
 *
 * WHY:  Executes workflow definitions step-by-step, managing state transitions,
 *       error handling, timeouts, and observability.
 *
 * HOW:
 *   1. Creates initial state from workflow definition + input
 *   2. Resolves the current step
 *   3. Executes the step (receives state, returns updated state)
 *   4. Determines the next step (via step.next() or sequential order)
 *   5. Repeats until no next step or max duration exceeded
 *   6. Returns final state
 *
 * DESIGN PRINCIPLES:
 *   - State is immutable between steps (each returns new state)
 *   - Steps are independent (no shared mutable state)
 *   - Errors in one step fail the entire workflow (no partial results)
 *   - Timeout protection prevents runaway workflows
 *   - Every step transition is logged for debugging
 */

import "server-only";

import type {
  WorkflowDefinition,
  WorkflowState,
  WorkflowStep,
  WorkflowEvent,
} from "./types";

// ── Event Handlers ────────────────────────────────────────────────────────────

type WorkflowEventHandler = (event: WorkflowEvent) => void;
const eventHandlers: WorkflowEventHandler[] = [];

export function onWorkflowEvent(handler: WorkflowEventHandler): void {
  eventHandlers.push(handler);
}

function emit(event: WorkflowEvent): void {
  for (const handler of eventHandlers) {
    try {
      handler(event);
    } catch {
      // Never let event handlers crash the workflow
    }
  }
}

// Register default console logger
onWorkflowEvent((event) => {
  const stepInfo = event.step ? ` [${event.step}]` : "";
  const duration = event.durationMs ? ` ${event.durationMs}ms` : "";
  console.log(`[workflow] ${event.type}${stepInfo} | ${event.workflowId}/${event.runId}${duration}`);
});

// ── Runner ────────────────────────────────────────────────────────────────────

/**
 * Execute a workflow definition with the given input data.
 *
 * @param definition - The workflow to run
 * @param input - Initial data to seed the workflow state
 * @param context - Who triggered this (for audit)
 * @returns Final workflow state after all steps complete (or error)
 */
export async function runWorkflow(
  definition: WorkflowDefinition,
  input: Record<string, unknown>,
  context: { userId: string; workspaceId: string | null },
): Promise<WorkflowState> {
  const runId = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const maxDuration = definition.maxDurationMs ?? 60_000;
  const startTime = Date.now();

  // Build step lookup map
  const stepMap = new Map<string, WorkflowStep>(
    definition.steps.map((s) => [s.id, s]),
  );

  // Initialize state
  let state: WorkflowState = {
    runId,
    workflowId: definition.id,
    status: "running",
    currentStep: definition.entryStep,
    completedSteps: [],
    data: { ...input },
    startedAt: new Date().toISOString(),
    triggeredBy: context,
  };

  emit({
    type: "workflow.started",
    runId,
    workflowId: definition.id,
    timestamp: state.startedAt,
  });

  // Execute steps
  while (state.currentStep && state.status === "running") {
    // Timeout check
    if (Date.now() - startTime > maxDuration) {
      state = {
        ...state,
        status: "failed",
        error: `Workflow timed out after ${maxDuration}ms`,
        completedAt: new Date().toISOString(),
      };
      emit({
        type: "workflow.failed",
        runId,
        workflowId: definition.id,
        timestamp: state.completedAt!,
        error: state.error,
      });
      return state;
    }

    const step = stepMap.get(state.currentStep);
    if (!step) {
      state = {
        ...state,
        status: "failed",
        error: `Step "${state.currentStep}" not found in workflow definition`,
        completedAt: new Date().toISOString(),
      };
      emit({
        type: "workflow.failed",
        runId,
        workflowId: definition.id,
        timestamp: state.completedAt!,
        error: state.error,
      });
      return state;
    }

    // Execute step
    const stepStart = Date.now();
    try {
      state = await step.execute(state);
      const stepDuration = Date.now() - stepStart;

      state = {
        ...state,
        completedSteps: [...state.completedSteps, step.id],
      };

      emit({
        type: "workflow.step.completed",
        runId,
        workflowId: definition.id,
        step: step.id,
        timestamp: new Date().toISOString(),
        durationMs: stepDuration,
      });

      // Determine next step
      if (step.next) {
        state = { ...state, currentStep: step.next(state) };
      } else {
        // Default: next step in sequential order
        const currentIndex = definition.steps.findIndex((s) => s.id === step.id);
        const nextStep = definition.steps[currentIndex + 1];
        state = { ...state, currentStep: nextStep?.id ?? null };
      }
    } catch (error) {
      state = {
        ...state,
        status: "failed",
        error: `Step "${step.id}" failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        completedAt: new Date().toISOString(),
      };
      emit({
        type: "workflow.failed",
        runId,
        workflowId: definition.id,
        step: step.id,
        timestamp: state.completedAt!,
        durationMs: Date.now() - stepStart,
        error: state.error,
      });
      return state;
    }
  }

  // Workflow completed successfully
  state = {
    ...state,
    status: "completed",
    currentStep: null,
    completedAt: new Date().toISOString(),
  };

  emit({
    type: "workflow.completed",
    runId,
    workflowId: definition.id,
    timestamp: state.completedAt!,
    durationMs: Date.now() - startTime,
  });

  return state;
}
