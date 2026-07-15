/**
 * RegLayer — Agent Orchestrator
 *
 * WHY:  Complex accessibility tasks require multiple types of expertise.
 *       The orchestrator coordinates specialized agents:
 *       1. Planner decomposes the request into subtasks
 *       2. Specialist agents execute their subtasks
 *       3. Reviewer combines findings into a final report
 *
 * HOW:
 *   1. User sends a complex request
 *   2. Planner agent determines which specialists to invoke
 *   3. Each specialist runs with shared context from previous agents
 *   4. Reviewer synthesizes all findings
 *   5. Final result returned
 *
 * THIS IS HOW:
 *   - Devin coordinates planning, coding, and testing agents
 *   - AutoGPT decomposes goals into agent-executable tasks
 *   - CrewAI assigns roles to specialized agents
 */

import "server-only";

import { complete, getDefaultModelId } from "@/lib/ai/gateway";
import { getAgent } from "./definitions";
import type { AgentContext, AgentId, AgentResult, OrchestrationPlan } from "./types";

/**
 * Run a single agent with a task and shared context.
 */
async function runAgent(
  agentId: AgentId,
  context: AgentContext,
): Promise<AgentResult> {
  const start = Date.now();
  const agent = getAgent(agentId);

  if (!agent) {
    return { agentId, output: "", success: false, error: `Agent "${agentId}" not found`, durationMs: 0 };
  }

  const modelId = getDefaultModelId();
  if (!modelId) {
    return { agentId, output: "", success: false, error: "No AI model available", durationMs: 0 };
  }

  try {
    // Build agent messages with shared context
    const contextSummary = Object.keys(context.sharedContext).length > 0
      ? `\n\nContext from previous agents:\n${JSON.stringify(context.sharedContext, null, 2)}`
      : "";

    const result = await complete({
      model: modelId,
      messages: [
        { role: "system", content: agent.systemPrompt },
        { role: "user", content: `${context.task}${contextSummary}` },
      ],
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      metadata: {
        feature: `agent-${agentId}`,
        userId: context.userId,
        workspaceId: context.workspaceId ?? undefined,
      },
    });

    const durationMs = Date.now() - start;

    if (!result) {
      return { agentId, output: "", success: false, error: "AI provider unavailable", durationMs };
    }

    return {
      agentId,
      output: result.content,
      durationMs,
      success: true,
    };
  } catch (error) {
    return {
      agentId,
      output: "",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Orchestrate multiple agents to handle a complex request.
 *
 * Flow:
 *   1. Planner decomposes → list of (agentId, task) pairs
 *   2. Each agent runs sequentially with accumulated context
 *   3. Reviewer synthesizes (if multiple agents were used)
 *
 * @param request - The user's complex request
 * @param context - User/workspace context
 * @returns OrchestrationPlan with all agent results
 */
export async function orchestrate(
  request: string,
  context: { userId: string; workspaceId: string | null },
): Promise<OrchestrationPlan> {
  const startTime = Date.now();
  const plan: OrchestrationPlan = {
    request,
    agentSequence: [],
    results: [],
    status: "running",
    totalDurationMs: 0,
  };

  // Step 1: Planner determines which agents to invoke
  const plannerResult = await runAgent("planner", {
    task: request,
    sharedContext: {},
    userId: context.userId,
    workspaceId: context.workspaceId,
  });

  plan.results.push(plannerResult);
  plan.agentSequence.push("planner");

  if (!plannerResult.success) {
    plan.status = "failed";
    plan.totalDurationMs = Date.now() - startTime;
    return plan;
  }

  // Parse planner's delegation plan
  let subtasks: { agent: string; task: string }[] = [];
  try {
    const parsed = JSON.parse(plannerResult.output);
    subtasks = parsed.subtasks ?? [];
  } catch {
    // Planner didn't return valid JSON — treat the whole output as a single-agent response
    plan.status = "completed";
    plan.totalDurationMs = Date.now() - startTime;
    return plan;
  }

  if (subtasks.length === 0) {
    plan.status = "completed";
    plan.totalDurationMs = Date.now() - startTime;
    return plan;
  }

  // Step 2: Execute each specialist agent sequentially
  const sharedContext: Record<string, unknown> = {};

  for (const subtask of subtasks) {
    const agentId = subtask.agent as AgentId;
    plan.agentSequence.push(agentId);

    const result = await runAgent(agentId, {
      task: subtask.task,
      sharedContext,
      userId: context.userId,
      workspaceId: context.workspaceId,
    });

    plan.results.push(result);

    if (result.success) {
      // Accumulate context for next agents
      sharedContext[agentId] = result.output;
    }
  }

  plan.status = plan.results.every((r) => r.success) ? "completed" : "failed";
  plan.totalDurationMs = Date.now() - startTime;

  console.log(
    `[agents] Orchestration ${plan.status} | ${plan.agentSequence.join(" → ")} | ${plan.totalDurationMs}ms`,
  );

  return plan;
}
