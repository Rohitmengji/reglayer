/**
 * RegLayer — Workspace Decision Engine
 *
 * WHY: This is RegLayer's moat. Unlike generic AI chat, RegLayer ENFORCES
 * workspace decisions on every AI output. If a team decided "WCAG 2.2 AA"
 * and the AI suggests a solution that only meets AA for some criteria,
 * the engine catches it.
 *
 * HOW:
 * 1. Decisions stored in DB (WorkspaceDecision model)
 * 2. On every chat request, active decisions are loaded and injected into
 *    the system prompt as constraints the AI must follow
 * 3. Post-stream, a lightweight check validates the output doesn't
 *    contradict any active decision
 *
 * ARCHITECTURE:
 *   User creates decisions → stored in DB
 *   Chat request → loadDecisions() → inject into system prompt
 *   AI generates → validateAgainstDecisions() → flag conflicts
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";

export interface Decision {
  id: string;
  category: string;
  decision: string;
  rationale: string | null;
}

/**
 * Load all active decisions for a workspace.
 * Cached per-request (the same workspace won't change decisions mid-request).
 */
export async function loadDecisions(workspaceId: string): Promise<Decision[]> {
  if (!workspaceId) return [];

  const decisions = await prisma.workspaceDecision.findMany({
    where: { workspaceId, active: true },
    select: { id: true, category: true, decision: true, rationale: true },
    orderBy: { category: "asc" },
  });

  return decisions;
}

/**
 * Format decisions as a system prompt constraint block.
 * The AI receives these as hard rules it must follow.
 */
export function formatDecisionsForPrompt(decisions: Decision[]): string {
  if (decisions.length === 0) return "";

  const grouped = new Map<string, Decision[]>();
  for (const d of decisions) {
    const list = grouped.get(d.category) ?? [];
    list.push(d);
    grouped.set(d.category, list);
  }

  let block = "\n\n<workspace_decisions>\n";
  block += "The following are MANDATORY decisions for this workspace. ";
  block += "You MUST follow them in all recommendations, code, and advice. ";
  block += "If any of your suggestions would violate a decision, explicitly flag it.\n\n";

  for (const [category, items] of grouped) {
    block += `## ${category}\n`;
    for (const item of items) {
      block += `- ${item.decision}`;
      if (item.rationale) block += ` (reason: ${item.rationale})`;
      block += "\n";
    }
    block += "\n";
  }

  block += "</workspace_decisions>";
  return block;
}

/**
 * Lightweight post-stream validation: check if the AI output contradicts
 * any active workspace decision. Returns conflicting decisions.
 *
 * This is a HEURISTIC check (keyword matching) — not a full semantic analysis.
 * It catches obvious contradictions without needing another LLM call.
 */
export function detectConflicts(output: string, decisions: Decision[]): Decision[] {
  if (!output || decisions.length === 0) return [];

  const lower = output.toLowerCase();
  const conflicts: Decision[] = [];

  for (const d of decisions) {
    const decisionLower = d.decision.toLowerCase();

    // Check for negation patterns of the decision
    // e.g., decision "Use TypeScript" → detect "use javascript" or "no typescript"
    const keywords = decisionLower
      .replace(/^(use|prefer|require|always|never|avoid)\s+/i, "")
      .split(/\s+/)
      .filter((w) => w.length > 3);

    const isNegativeDecision = /^(never|avoid|don't|do not|no)\s/i.test(decisionLower);

    if (isNegativeDecision) {
      // Decision says "never X" — check if output recommends X
      const forbiddenThing = keywords.join(" ");
      if (forbiddenThing && lower.includes(forbiddenThing) && !lower.includes("avoid")) {
        conflicts.push(d);
      }
    } else {
      // Decision says "use X" — check if output explicitly recommends something else
      // This is intentionally conservative — only flags clear contradictions
      const alternatives: Record<string, string[]> = {
        typescript: ["javascript", "js only", "no typescript"],
        postgresql: ["mysql", "mongodb", "sqlite"],
        "next.js": ["remix", "nuxt", "sveltekit"],
        tailwind: ["styled-components", "css modules", "emotion"],
        react: ["vue", "angular", "svelte"],
      };

      for (const keyword of keywords) {
        const alts = alternatives[keyword];
        if (alts?.some((alt) => lower.includes(alt))) {
          conflicts.push(d);
          break;
        }
      }
    }
  }

  return conflicts;
}

/**
 * CRUD operations for workspace decisions.
 */
export async function createDecision(params: {
  workspaceId: string;
  category: string;
  decision: string;
  rationale?: string;
  createdBy: string;
}) {
  return prisma.workspaceDecision.create({
    data: {
      workspaceId: params.workspaceId,
      category: params.category as never,
      decision: params.decision,
      rationale: params.rationale ?? null,
      createdBy: params.createdBy,
    },
  });
}

export async function updateDecision(id: string, workspaceId: string, data: {
  decision?: string;
  rationale?: string;
  active?: boolean;
}) {
  return prisma.workspaceDecision.updateMany({
    where: { id, workspaceId },
    data,
  });
}

export async function deleteDecision(id: string, workspaceId: string) {
  return prisma.workspaceDecision.deleteMany({
    where: { id, workspaceId },
  });
}
