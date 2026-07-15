/**
 * RegLayer — Workflow Engine Types
 *
 * WHY:  Multi-step AI workflows (scan → evaluate → plan → notify) need a
 *       state machine. These types define how workflows are structured,
 *       executed, and tracked.
 *
 * DESIGN:
 *   - A Workflow is a directed graph of Steps
 *   - Each Step has an execute function that receives state and returns state
 *   - Steps can branch (conditional routing based on state)
 *   - The Runner walks the graph, executing steps in order
 *   - State is immutable between steps (each step returns new state)
 *   - Workflows are serializable (can be persisted, resumed, retried)
 *
 * THIS MIRRORS LANGGRAPH:
 *   - State = the shared context passed between nodes
 *   - Nodes = our Steps (functions that transform state)
 *   - Edges = our routing (next step resolution)
 *   - Conditional edges = our branch() logic
 */

// ── Workflow Identity ──────────────────────────────────────────────────────────

export type WorkflowId =
  | "compliance-audit"
  | "remediation-plan"
  | "scan-and-report";

export type WorkflowStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

// ── Workflow State ─────────────────────────────────────────────────────────────
// State flows through the workflow. Each step reads it and returns updated state.

export interface WorkflowState {
  /** Unique run ID for this execution. */
  runId: string;
  /** Which workflow is running. */
  workflowId: WorkflowId;
  /** Current status. */
  status: WorkflowStatus;
  /** Which step is currently executing (null if not started). */
  currentStep: string | null;
  /** Ordered list of completed step IDs. */
  completedSteps: string[];
  /** Arbitrary data passed between steps. */
  data: Record<string, unknown>;
  /** Error message if failed. */
  error?: string;
  /** Timestamps. */
  startedAt: string;
  completedAt?: string;
  /** Who triggered this workflow. */
  triggeredBy: { userId: string; workspaceId: string | null };
}

// ── Step Definition ───────────────────────────────────────────────────────────

export interface WorkflowStep {
  /** Unique ID for this step within the workflow. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** What this step does. */
  description: string;
  /**
   * Execute this step. Receives current state, returns updated state.
   * Can call LLMs, tools, database queries — anything async.
   */
  execute: (state: WorkflowState) => Promise<WorkflowState>;
  /**
   * Determine the next step ID based on current state.
   * If undefined, uses the default sequential order.
   * Return null to end the workflow.
   */
  next?: (state: WorkflowState) => string | null;
}

// ── Workflow Definition ────────────────────────────────────────────────────────

export interface WorkflowDefinition {
  /** Unique workflow ID. */
  id: WorkflowId;
  /** Human-readable name. */
  name: string;
  /** Description of what this workflow does. */
  description: string;
  /** Ordered list of steps (default execution order). */
  steps: WorkflowStep[];
  /** The first step to execute. */
  entryStep: string;
  /** Maximum execution time in milliseconds (default 60s). */
  maxDurationMs?: number;
}

// ── Workflow Events (for observability) ───────────────────────────────────────

export interface WorkflowEvent {
  type: "workflow.started" | "workflow.step.completed" | "workflow.completed" | "workflow.failed";
  runId: string;
  workflowId: WorkflowId;
  step?: string;
  timestamp: string;
  durationMs?: number;
  error?: string;
}
