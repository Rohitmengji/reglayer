/**
 * RegLayer — Workspace Memory (AI Operating System)
 *
 * Unified memory layer that gives every AI feature access to the workspace's
 * full context: documents, prompts, tools, agents, evaluations, and workflows.
 *
 * WHAT THIS SOLVES:
 *   Before: Each AI module queries its own data in isolation.
 *   - Chat doesn't know about scheduled agents
 *   - Agents don't know about uploaded documents
 *   - Experiments don't know about active workflows
 *
 *   After: Every AI feature gets a WorkspaceContext that includes ALL resources.
 *   Like giving each AI call the "full brain" of the organization.
 *
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │                 WORKSPACE MEMORY                         │
 *   │                                                          │
 *   │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
 *   │  │Documents │ │ Prompts  │ │  Tools   │ │ Agents   │  │
 *   │  │ (PDFs,   │ │ (custom  │ │ (custom  │ │ (blue-   │  │
 *   │  │  policies│ │  prompt  │ │  tool    │ │  prints  │  │
 *   │  │  guides) │ │  library)│ │  configs)│ │  + runs) │  │
 *   │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │
 *   │       └─────────────┼───────────┼─────────────┘         │
 *   │                     ▼                                    │
 *   │              ┌─────────────┐                            │
 *   │              │  Workspace  │                            │
 *   │              │  Context    │ ← resolveWorkspaceContext() │
 *   │              └──────┬──────┘                            │
 *   │                     │                                    │
 *   │  ┌──────────┐ ┌────┴─────┐ ┌──────────┐ ┌──────────┐  │
 *   │  │Evaluations│ │Workflows│ │ Memory   │ │ Scans/   │  │
 *   │  │(experiment│ │(active  │ │ (user +  │ │ Violations│ │
 *   │  │ results) │ │ running)│ │  team)   │ │ (recent) │  │
 *   │  └──────────┘ └─────────┘ └──────────┘ └──────────┘  │
 *   └─────────────────────────────────────────────────────────┘
 *
 * INSPIRED BY:
 *   - Notion AI (workspace documents as context)
 *   - Cursor (project-wide codebase context)
 *   - ChatGPT Teams (shared instructions + data)
 *   - Glean (organizational knowledge graph)
 *   - Anthropic Projects (shared project knowledge)
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { getMemories, formatMemoriesForPrompt, type MemoryEntry } from "@/lib/ai/memory/service";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkspaceContext {
  workspaceId: string;
  workspaceName: string;
  plan: string;

  /** AI memories (user + workspace + system) */
  memories: MemoryEntry[];
  /** Formatted memory string for prompt injection */
  memoryPrompt: string;

  /** Summary of workspace resources */
  resources: WorkspaceResources;

  /** Formatted context string for LLM system prompt */
  systemContext: string;
}

export interface WorkspaceResources {
  /** Total scans run, with recent summary */
  scans: { total: number; recent: ScanSummary[] };
  /** Sites being monitored */
  sites: { total: number; names: string[] };
  /** Team members */
  members: { total: number; roles: Record<string, number> };
  /** Uploaded documents */
  documents: { total: number; ready: number };
  /** Custom agents */
  agents: { total: number; active: string[] };
  /** Active schedules */
  schedules: { total: number; enabled: number };
  /** Running experiments */
  experiments: { total: number; running: number };
  /** Pending approvals */
  approvals: { pending: number };
}

interface ScanSummary {
  url: string;
  score: number | null;
  date: string;
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Resolve the full workspace context for AI features.
 *
 * This is called once per AI request (cached per session) to give the LLM
 * awareness of the workspace's full state — documents, agents, scans, team,
 * preferences, and active automation.
 *
 * @param workspaceId Target workspace
 * @param userId Current user (for personal memories)
 * @param opts Options to control which resources to load
 */
export async function resolveWorkspaceContext(
  workspaceId: string,
  userId: string,
  opts?: { light?: boolean },
): Promise<WorkspaceContext> {
  const light = opts?.light ?? false;

  // Load workspace metadata + resources in parallel
  const [workspace, memories, resources] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, plan: true },
    }),
    getMemories({ userId, workspaceId }),
    light ? getResourcesLight(workspaceId) : getResources(workspaceId),
  ]);

  const memoryPrompt = formatMemoriesForPrompt(memories);
  const systemContext = buildSystemContext(
    workspace?.name ?? "Unknown",
    workspace?.plan ?? "FREE",
    resources,
    memoryPrompt,
  );

  return {
    workspaceId,
    workspaceName: workspace?.name ?? "Unknown",
    plan: workspace?.plan ?? "FREE",
    memories,
    memoryPrompt,
    resources,
    systemContext,
  };
}

// ── Resource Loading ──────────────────────────────────────────────────────────

/**
 * Load full workspace resources (for thorough AI context).
 */
async function getResources(workspaceId: string): Promise<WorkspaceResources> {
  const [
    scanCount, recentScans, siteCount, sites,
    memberCount, memberRoles,
    docTotal, docReady,
    agentTotal, activeAgents,
    scheduleTotal, scheduleEnabled,
    experimentTotal, experimentRunning,
    approvalPending,
  ] = await Promise.all([
    prisma.scan.count({ where: { workspaceId } }),
    prisma.scan.findMany({
      where: { workspaceId, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { url: true, score: true, createdAt: true },
    }),
    prisma.site.count({ where: { workspaceId } }),
    prisma.site.findMany({
      where: { workspaceId },
      take: 10,
      select: { url: true, name: true },
    }),
    prisma.workspaceMember.count({ where: { workspaceId } }),
    prisma.workspaceMember.groupBy({
      by: ["role"],
      where: { workspaceId },
      _count: true,
    }),
    prisma.knowledgeDocument.count({ where: { workspaceId } }),
    prisma.knowledgeDocument.count({ where: { workspaceId, status: "READY" } }),
    prisma.agentBlueprint.count({ where: { OR: [{ workspaceId }, { isSystem: true }] } }),
    prisma.agentBlueprint.findMany({
      where: { OR: [{ workspaceId }, { isSystem: true }] },
      select: { slug: true },
      take: 10,
    }),
    prisma.agentSchedule.count({ where: { workspaceId } }),
    prisma.agentSchedule.count({ where: { workspaceId, enabled: true } }),
    prisma.aiExperiment.count({ where: { workspaceId } }),
    prisma.aiExperiment.count({ where: { workspaceId, status: "RUNNING" } }),
    prisma.approvalRequest.count({ where: { workspaceId, status: "PENDING" } }),
  ]);

  const roles: Record<string, number> = {};
  for (const r of memberRoles) {
    roles[r.role] = r._count;
  }

  return {
    scans: {
      total: scanCount,
      recent: recentScans.map((s) => ({
        url: s.url,
        score: s.score,
        date: s.createdAt.toISOString().split("T")[0],
      })),
    },
    sites: {
      total: siteCount,
      names: sites.map((s) => s.name || s.url),
    },
    members: { total: memberCount, roles },
    documents: { total: docTotal, ready: docReady },
    agents: { total: agentTotal, active: activeAgents.map((a) => a.slug) },
    schedules: { total: scheduleTotal, enabled: scheduleEnabled },
    experiments: { total: experimentTotal, running: experimentRunning },
    approvals: { pending: approvalPending },
  };
}

/**
 * Light resource loading (counts only, no lists). For fast AI calls.
 */
async function getResourcesLight(workspaceId: string): Promise<WorkspaceResources> {
  const [scans, sites, members, docs, agents, schedules, experiments, approvals] = await Promise.all([
    prisma.scan.count({ where: { workspaceId } }),
    prisma.site.count({ where: { workspaceId } }),
    prisma.workspaceMember.count({ where: { workspaceId } }),
    prisma.knowledgeDocument.count({ where: { workspaceId } }),
    prisma.agentBlueprint.count({ where: { OR: [{ workspaceId }, { isSystem: true }] } }),
    prisma.agentSchedule.count({ where: { workspaceId, enabled: true } }),
    prisma.aiExperiment.count({ where: { workspaceId, status: "RUNNING" } }),
    prisma.approvalRequest.count({ where: { workspaceId, status: "PENDING" } }),
  ]);

  return {
    scans: { total: scans, recent: [] },
    sites: { total: sites, names: [] },
    members: { total: members, roles: {} },
    documents: { total: docs, ready: 0 },
    agents: { total: agents, active: [] },
    schedules: { total: 0, enabled: schedules },
    experiments: { total: 0, running: experiments },
    approvals: { pending: approvals },
  };
}

// ── System Context Builder ────────────────────────────────────────────────────

/**
 * Build the workspace-aware system context for LLM injection.
 * This becomes part of the system prompt so the AI "knows" the workspace.
 */
function buildSystemContext(
  name: string,
  plan: string,
  resources: WorkspaceResources,
  memoryPrompt: string,
): string {
  const sections: string[] = [];

  // Workspace identity
  sections.push(`## Workspace: ${name} (${plan} plan)`);

  // Resource awareness
  const stats: string[] = [];
  if (resources.scans.total > 0) stats.push(`${resources.scans.total} scans completed`);
  if (resources.sites.total > 0) stats.push(`${resources.sites.total} sites monitored`);
  if (resources.members.total > 0) stats.push(`${resources.members.total} team members`);
  if (resources.documents.total > 0) stats.push(`${resources.documents.ready}/${resources.documents.total} documents indexed`);
  if (resources.agents.total > 0) stats.push(`${resources.agents.total} agents available`);
  if (resources.schedules.enabled > 0) stats.push(`${resources.schedules.enabled} automated schedules active`);
  if (resources.experiments.running > 0) stats.push(`${resources.experiments.running} A/B experiments running`);
  if (resources.approvals.pending > 0) stats.push(`${resources.approvals.pending} items awaiting approval`);

  if (stats.length > 0) {
    sections.push("## Workspace Resources\n" + stats.map((s) => `- ${s}`).join("\n"));
  }

  // Recent scans
  if (resources.scans.recent.length > 0) {
    sections.push(
      "## Recent Scans\n" +
      resources.scans.recent.map((s) =>
        `- ${s.url}: score ${s.score ?? "pending"} (${s.date})`
      ).join("\n"),
    );
  }

  // Monitored sites
  if (resources.sites.names.length > 0) {
    sections.push("## Monitored Sites\n" + resources.sites.names.map((s) => `- ${s}`).join("\n"));
  }

  // Available agents
  if (resources.agents.active.length > 0) {
    sections.push(
      "## Available Agents\n" +
      `You can delegate tasks to: ${resources.agents.active.join(", ")}`,
    );
  }

  // Personalization (user + workspace memories)
  if (memoryPrompt) {
    sections.push(memoryPrompt);
  }

  return sections.join("\n\n");
}

// ── Context Invalidation ──────────────────────────────────────────────────────

/**
 * Events that should invalidate the cached workspace context:
 * - New scan completed
 * - Document uploaded/processed
 * - Team member added/removed
 * - Agent created/deleted
 * - Memory updated
 *
 * Currently: no caching (context is rebuilt per request).
 * Future: Redis-cached with event-driven invalidation.
 */
export const INVALIDATION_EVENTS = [
  "scan.completed",
  "document.processed",
  "member.added",
  "member.removed",
  "agent.created",
  "agent.deleted",
  "memory.updated",
  "schedule.changed",
] as const;
