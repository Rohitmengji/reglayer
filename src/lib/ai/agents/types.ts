/**
 * RegLayer — Multi-Agent Orchestration Types
 *
 * WHY:  Single-agent chat can answer questions. Multi-agent systems can
 *       decompose complex tasks into specialized subtasks, each handled
 *       by an agent with domain expertise and specific tools.
 *
 * ARCHITECTURE:
 *   - AgentDefinition: static config (persona, tools, system prompt)
 *   - AgentContext: runtime state (memory, parent agent, workspace)
 *   - AgentResult: what an agent returns after completing its task
 *   - Orchestrator: coordinates multiple agents on a task
 */

export type AgentId =
  | "planner"
  | "scanner"
  | "legal"
  | "developer"
  | "reviewer";

export interface AgentDefinition {
  id: AgentId;
  name: string;
  description: string;
  /** System prompt that defines this agent's persona and expertise. */
  systemPrompt: string;
  /** Which tools this agent can use. */
  capabilities: string[];
  /** Maximum tokens this agent can generate per turn. */
  maxTokens: number;
  /** Temperature for this agent's responses. */
  temperature: number;
}

export interface AgentContext {
  /** The task assigned to this agent. */
  task: string;
  /** Data from previous agents (shared context). */
  sharedContext: Record<string, unknown>;
  /** Who triggered this agent chain. */
  userId: string;
  workspaceId: string | null;
}

export interface AgentResult {
  agentId: AgentId;
  /** The agent's output (analysis, plan, code, etc.) */
  output: string;
  /** Structured data extracted by the agent. */
  data?: Record<string, unknown>;
  /** How long this agent took. */
  durationMs: number;
  /** Whether the agent completed successfully. */
  success: boolean;
  error?: string;
}

export interface OrchestrationPlan {
  /** The original user request. */
  request: string;
  /** Ordered list of agents to invoke. */
  agentSequence: AgentId[];
  /** Final combined result. */
  results: AgentResult[];
  /** Overall status. */
  status: "running" | "completed" | "failed";
  totalDurationMs: number;
}
