/**
 * RegLayer — Agent-to-Agent (A2A) Communication Protocol
 *
 * Instead of a single orchestrator controlling all agents, agents communicate
 * directly — sending messages, delegating tasks, and building on each other's work.
 *
 * WHY A2A > ORCHESTRATOR:
 *   Orchestrator: Planner decides everything upfront, agents can't adapt.
 *   A2A: Agents discover they need help mid-task, delegate dynamically.
 *
 *   Example: Legal Analyst finds an ambiguous ADA requirement → sends HANDOFF
 *   to Compliance Auditor asking "does violation X fall under Title III?" →
 *   gets answer → continues analysis. No orchestrator needed.
 *
 * MESSAGE TYPES:
 *   USER    — Human → Agent (initial task)
 *   AGENT   — Agent response (analysis, answer)
 *   HANDOFF — Agent → Agent delegation ("I need you to...")
 *   SYSTEM  — System instruction (context, constraints)
 *   TOOL    — Tool call result
 *
 * PROTOCOL:
 *   1. User sends task to an agent (creates conversation)
 *   2. Agent works on it, may HANDOFF subtasks to other agents
 *   3. Other agents respond, results flow back
 *   4. Original agent synthesizes and responds to user
 *   5. Conversation persisted for audit trail
 *
 * SAFETY:
 *   - Max 10 handoffs per conversation (prevent infinite loops)
 *   - Cost tracking per message (stay within agent's budget)
 *   - Permission checking on every tool call
 *   - Conversation timeout (5 minutes max)
 *
 * INSPIRED BY:
 *   - Google A2A Protocol (agent-to-agent communication standard)
 *   - AutoGen (multi-agent conversation patterns)
 *   - CrewAI (agent delegation and collaboration)
 *   - LangGraph (agent state machines with message passing)
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { complete } from "@/lib/ai/gateway";
import { getBlueprint, type AgentBlueprint } from "@/lib/ai/marketplace/registry";
import type { ModelId } from "@/lib/ai/gateway/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MessageRole = "USER" | "AGENT" | "SYSTEM" | "HANDOFF" | "TOOL";

export interface A2AMessage {
  id: string;
  role: MessageRole;
  content: string;
  fromAgentSlug: string | null;
  toAgentSlug: string | null;
  tokenCount: number;
  costUsd: number;
  latencyMs: number;
  createdAt: Date;
}

export interface Conversation {
  id: string;
  status: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  agentSlug: string;
  messages: A2AMessage[];
  totalCostUsd: number;
  createdAt: Date;
}

export interface HandoffRequest {
  fromAgent: string;   // slug of requesting agent
  toAgent: string;     // slug of target agent
  task: string;        // what the target agent should do
  context: string;     // relevant context from the conversation so far
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_HANDOFFS = 10;         // prevent infinite delegation loops
const MAX_TURNS = 20;            // max messages in a conversation
const CONVERSATION_TIMEOUT_MS = 300_000; // 5 minutes

// ── Conversation Management ───────────────────────────────────────────────────

/**
 * Start a new agent conversation.
 * User sends initial task → agent begins working.
 */
export async function startConversation(opts: {
  agentSlug: string;
  task: string;
  userId: string;
  workspaceId: string;
}): Promise<Conversation> {
  const blueprint = await getBlueprint(opts.agentSlug);
  if (!blueprint) {
    throw new Error(`Agent "${opts.agentSlug}" not found`);
  }

  const conversation = await prisma.agentConversation.create({
    data: {
      blueprintId: blueprint.id,
      workspaceId: opts.workspaceId,
      initiator: opts.userId,
      metadata: { task: opts.task },
      messages: {
        create: {
          role: "USER",
          content: opts.task,
          fromAgentSlug: null,
          toAgentSlug: opts.agentSlug,
        },
      },
    },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  return mapConversation(conversation, opts.agentSlug);
}

/**
 * Run the next turn in a conversation.
 * The target agent processes the latest message and responds.
 */
export async function runTurn(
  conversationId: string,
  agentSlug: string,
): Promise<{ message: A2AMessage; handoff?: HandoffRequest }> {
  const blueprint = await getBlueprint(agentSlug);
  if (!blueprint) {
    throw new Error(`Agent "${agentSlug}" not found`);
  }

  // Load conversation history
  const messages = await prisma.agentMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

  if (messages.length >= MAX_TURNS) {
    throw new Error("Conversation turn limit reached");
  }

  // Check cost limit
  const totalCost = messages.reduce((sum, m) => sum + m.costUsd, 0);
  if (blueprint.costLimitUsd && totalCost >= blueprint.costLimitUsd) {
    throw new Error(`Agent "${agentSlug}" cost limit exceeded ($${totalCost.toFixed(4)}/$${blueprint.costLimitUsd})`);
  }

  // Build LLM messages from conversation history
  const llmMessages = buildLLMMessages(blueprint, messages);

  // Call LLM
  const start = Date.now();
  const response = await complete({
    model: blueprint.model as ModelId,
    messages: llmMessages,
    temperature: blueprint.temperature,
    maxTokens: blueprint.maxTokens,
    metadata: {
      feature: "a2a-agent",
      userId: agentSlug,
    },
  });

  const latencyMs = Date.now() - start;

  if (!response) {
    throw new Error("LLM provider unavailable");
  }

  // Check for handoff requests in the response
  const handoff = detectHandoff(response.content, agentSlug);

  // Persist the agent's response
  const agentMessage = await prisma.agentMessage.create({
    data: {
      conversationId,
      role: handoff ? "HANDOFF" : "AGENT",
      content: response.content,
      fromAgentSlug: agentSlug,
      toAgentSlug: handoff?.toAgent ?? null,
      tokenCount: response.usage.totalTokens,
      costUsd: response.cost.totalCost,
      latencyMs,
    },
  });

  return {
    message: mapMessage(agentMessage),
    handoff: handoff ?? undefined,
  };
}

/**
 * Execute a handoff: deliver a task from one agent to another.
 * The target agent receives the task with context and responds.
 */
export async function executeHandoff(
  conversationId: string,
  handoff: HandoffRequest,
): Promise<A2AMessage> {
  // Check handoff count to prevent loops
  const handoffCount = await prisma.agentMessage.count({
    where: { conversationId, role: "HANDOFF" },
  });

  if (handoffCount >= MAX_HANDOFFS) {
    // Create a system message explaining the limit
    const limitMsg = await prisma.agentMessage.create({
      data: {
        conversationId,
        role: "SYSTEM",
        content: `Handoff limit reached (${MAX_HANDOFFS}). Agent ${handoff.fromAgent} tried to delegate to ${handoff.toAgent} but the conversation has exceeded the maximum delegation depth. The original agent must complete the task with available information.`,
        fromAgentSlug: null,
        toAgentSlug: handoff.fromAgent,
      },
    });
    return mapMessage(limitMsg);
  }

  // Create the handoff task message
  await prisma.agentMessage.create({
    data: {
      conversationId,
      role: "SYSTEM",
      content: `[HANDOFF from ${handoff.fromAgent}]\nTask: ${handoff.task}\nContext: ${handoff.context}`,
      fromAgentSlug: handoff.fromAgent,
      toAgentSlug: handoff.toAgent,
    },
  });

  // Run the target agent's turn
  const { message } = await runTurn(conversationId, handoff.toAgent);
  return message;
}

/**
 * Run a full agent conversation to completion.
 * Handles initial task → agent turns → handoffs → final response.
 */
export async function runConversation(opts: {
  agentSlug: string;
  task: string;
  userId: string;
  workspaceId: string;
}): Promise<Conversation> {
  const conversation = await startConversation(opts);
  const startTime = Date.now();

  let currentAgent = opts.agentSlug;
  let turns = 0;

  try {
    while (turns < MAX_TURNS) {
      // Timeout check
      if (Date.now() - startTime > CONVERSATION_TIMEOUT_MS) {
        break;
      }

      const { message, handoff } = await runTurn(conversation.id, currentAgent);
      turns++;

      if (handoff) {
        // Execute the handoff, then return to the original agent
        await executeHandoff(conversation.id, handoff);
        turns++;
        // Continue with the original agent to synthesize
        currentAgent = opts.agentSlug;
      } else {
        // No handoff — agent is done
        break;
      }
    }

    // Mark conversation as completed
    await prisma.agentConversation.update({
      where: { id: conversation.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  } catch (err) {
    await prisma.agentConversation.update({
      where: { id: conversation.id },
      data: { status: "FAILED" },
    });
  }

  // Reload full conversation
  const final = await prisma.agentConversation.findUnique({
    where: { id: conversation.id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      blueprint: true,
    },
  });

  return final ? mapConversation(final, opts.agentSlug) : conversation;
}

/**
 * Get conversation history for UI display.
 */
export async function getConversation(conversationId: string): Promise<Conversation | null> {
  const result = await prisma.agentConversation.findUnique({
    where: { id: conversationId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      blueprint: true,
    },
  });

  return result ? mapConversation(result, result.blueprint.slug) : null;
}

/**
 * List recent conversations for a workspace.
 */
export async function listConversations(
  workspaceId: string,
  opts?: { limit?: number; agentSlug?: string },
): Promise<Conversation[]> {
  const results = await prisma.agentConversation.findMany({
    where: {
      workspaceId,
      ...(opts?.agentSlug ? { blueprint: { slug: opts.agentSlug } } : {}),
    },
    include: {
      messages: { orderBy: { createdAt: "asc" }, take: 1 }, // just first message for preview
      blueprint: true,
    },
    orderBy: { createdAt: "desc" },
    take: opts?.limit ?? 25,
  });

  return results.map((r) => mapConversation(r, r.blueprint.slug));
}

// ── Handoff Detection ─────────────────────────────────────────────────────────

/**
 * Detect if an agent's response contains a handoff request.
 * Agents can delegate by including [HANDOFF:agent-slug] in their response.
 */
export function detectHandoff(content: string, fromAgent: string): HandoffRequest | null {
  const handoffPattern = /\[HANDOFF:([a-z-]+)\]\s*(?:Task:\s*)?(.+?)(?:\n|$)/i;
  const match = content.match(handoffPattern);

  if (!match) return null;

  const toAgent = match[1];
  const task = match[2].trim();

  // Don't allow self-handoff
  if (toAgent === fromAgent) return null;

  // Extract context from the rest of the message
  const contextStart = content.indexOf(match[0]) + match[0].length;
  const context = content.slice(contextStart).trim().slice(0, 1000); // cap context

  return { fromAgent, toAgent, task, context };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildLLMMessages(
  blueprint: AgentBlueprint,
  messages: Array<{ role: string; content: string; fromAgentSlug: string | null }>,
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const llmMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: blueprint.systemPrompt },
  ];

  for (const msg of messages) {
    if (msg.role === "USER" || msg.role === "SYSTEM" || msg.role === "HANDOFF") {
      llmMessages.push({ role: "user", content: msg.content });
    } else if (msg.role === "AGENT" && msg.fromAgentSlug === blueprint.slug) {
      llmMessages.push({ role: "assistant", content: msg.content });
    } else if (msg.role === "AGENT") {
      // Another agent's response — inject as context
      llmMessages.push({ role: "user", content: `[Response from ${msg.fromAgentSlug}]: ${msg.content}` });
    }
  }

  return llmMessages;
}

function mapMessage(row: {
  id: string; role: string; content: string;
  fromAgentSlug: string | null; toAgentSlug: string | null;
  tokenCount: number; costUsd: number; latencyMs: number; createdAt: Date;
}): A2AMessage {
  return {
    id: row.id,
    role: row.role as MessageRole,
    content: row.content,
    fromAgentSlug: row.fromAgentSlug,
    toAgentSlug: row.toAgentSlug,
    tokenCount: row.tokenCount,
    costUsd: row.costUsd,
    latencyMs: row.latencyMs,
    createdAt: row.createdAt,
  };
}

function mapConversation(
  row: {
    id: string; status: string; createdAt: Date;
    messages: Array<{
      id: string; role: string; content: string;
      fromAgentSlug: string | null; toAgentSlug: string | null;
      tokenCount: number; costUsd: number; latencyMs: number; createdAt: Date;
    }>;
  },
  agentSlug: string,
): Conversation {
  return {
    id: row.id,
    status: row.status as Conversation["status"],
    agentSlug,
    messages: row.messages.map(mapMessage),
    totalCostUsd: row.messages.reduce((sum, m) => sum + m.costUsd, 0),
    createdAt: row.createdAt,
  };
}
