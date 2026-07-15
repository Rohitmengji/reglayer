/**
 * RegLayer — AI Feature Flags
 *
 * Controls which AI features are enabled per plan/workspace.
 * Allows gradual rollout, A/B testing, and kill switches.
 *
 * Usage:
 *   if (isAIFeatureEnabled("streaming-chat", workspaceId)) { ... }
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";

export type AIFeatureFlag =
  | "streaming-chat"
  | "rag-search"
  | "tool-calling"
  | "multi-agent"
  | "workflow-builder"
  | "mcp-access"
  | "visual-scan"
  | "auto-embed";

interface FeatureConfig {
  /** Is this feature enabled globally? */
  enabled: boolean;
  /** Minimum plan required (null = all plans). */
  minPlan: "FREE" | "PRO" | "ENTERPRISE" | null;
  /** Feature description for admin dashboard. */
  description: string;
}

const AI_FEATURES: Record<AIFeatureFlag, FeatureConfig> = {
  "streaming-chat": { enabled: true, minPlan: null, description: "AI chat with streaming responses" },
  "rag-search": { enabled: true, minPlan: null, description: "RAG-augmented chat with violation context" },
  "tool-calling": { enabled: true, minPlan: null, description: "LLM can query database via tools" },
  "multi-agent": { enabled: true, minPlan: "PRO", description: "Multi-agent orchestration for complex tasks" },
  "workflow-builder": { enabled: true, minPlan: "PRO", description: "Custom workflow creation and execution" },
  "mcp-access": { enabled: true, minPlan: "ENTERPRISE", description: "MCP server for external AI clients" },
  "visual-scan": { enabled: true, minPlan: null, description: "Vision model screenshot analysis" },
  "auto-embed": { enabled: true, minPlan: null, description: "Auto-embed violations on scan completion" },
};

/**
 * Check if an AI feature is enabled for a workspace.
 * Checks: global flag → plan requirement → workspace override.
 */
export async function isAIFeatureEnabled(
  feature: AIFeatureFlag,
  workspaceId?: string | null,
): Promise<boolean> {
  const config = AI_FEATURES[feature];
  if (!config || !config.enabled) return false;

  // No plan requirement — available to all
  if (!config.minPlan) return true;

  // Check workspace plan
  if (!workspaceId) return config.minPlan === "FREE";

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true },
  });

  if (!workspace) return false;

  const planHierarchy = { FREE: 0, PRO: 1, ENTERPRISE: 2 };
  const userPlanLevel = planHierarchy[workspace.plan as keyof typeof planHierarchy] ?? 0;
  const requiredLevel = planHierarchy[config.minPlan];

  return userPlanLevel >= requiredLevel;
}

/**
 * Get all feature flags and their status.
 * Used for admin dashboards and debugging.
 */
export function getAllAIFeatures(): Record<AIFeatureFlag, FeatureConfig> {
  return { ...AI_FEATURES };
}

/**
 * Check multiple features at once (batch for performance).
 */
export async function getEnabledFeatures(
  workspaceId?: string | null,
): Promise<AIFeatureFlag[]> {
  const features = Object.keys(AI_FEATURES) as AIFeatureFlag[];
  const results = await Promise.all(
    features.map(async (f) => ({ feature: f, enabled: await isAIFeatureEnabled(f, workspaceId) })),
  );
  return results.filter((r) => r.enabled).map((r) => r.feature);
}
