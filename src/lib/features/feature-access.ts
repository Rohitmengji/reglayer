/**
 * RegLayer — Feature Access Control (Server-Side)
 *
 * Single-query resolution of workspace feature access.
 * No N+1, no redundant lookups, no session re-fetching.
 */

import { prisma } from "@/lib/database/prisma";
import { getDefaultFeatures, FEATURE_CATALOG, type FeatureDefinition } from "./feature-catalog";
import type { Plan } from "@/generated/prisma/client";

type AccessReason = "plan_default" | "admin_granted" | "admin_revoked" | "expired" | "not_in_plan";

interface FeatureAccessResult {
  enabled: boolean;
  reason: AccessReason;
}

interface DetailedFeature extends FeatureDefinition {
  enabled: boolean;
  source: "plan" | "granted" | "revoked" | "expired";
  override: {
    grantedBy: string;
    grantedAt: Date;
    expiresAt: Date | null;
    note: string | null;
  } | null;
}

/**
 * Resolve all feature access for a workspace in ONE query.
 * Returns the plan + resolved feature set + detailed breakdown.
 */
async function resolveWorkspace(workspaceId: string) {
  return prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true, featureOverrides: true },
  });
}

/**
 * Compute enabled features from plan + overrides.
 * Pure function — no DB calls.
 */
function computeEnabledFeatures(
  plan: Plan,
  overrides: { feature: string; enabled: boolean; expiresAt: Date | null }[]
): Set<string> {
  const enabled = new Set(getDefaultFeatures(plan));
  const now = new Date();

  for (const override of overrides) {
    const isExpired = override.expiresAt != null && now > override.expiresAt;
    if (isExpired) {
      enabled.delete(override.feature);
    } else if (override.enabled) {
      enabled.add(override.feature);
    } else {
      enabled.delete(override.feature);
    }
  }

  return enabled;
}

/**
 * Check single feature access for a workspace.
 * Single DB query — returns enabled + reason.
 */
export async function hasFeature(
  workspaceId: string,
  featureId: string
): Promise<FeatureAccessResult> {
  const workspace = await resolveWorkspace(workspaceId);
  if (!workspace) return { enabled: false, reason: "not_in_plan" };

  const override = workspace.featureOverrides.find((o) => o.feature === featureId);
  const isInPlan = getDefaultFeatures(workspace.plan).includes(featureId);

  if (override) {
    if (override.expiresAt && new Date() > override.expiresAt) {
      return { enabled: false, reason: "expired" };
    }
    return { enabled: override.enabled, reason: override.enabled ? "admin_granted" : "admin_revoked" };
  }

  return { enabled: isInPlan, reason: isInPlan ? "plan_default" : "not_in_plan" };
}

/**
 * Get all enabled feature IDs for a workspace. Single query.
 */
export async function getWorkspaceFeatures(workspaceId: string): Promise<string[]> {
  const workspace = await resolveWorkspace(workspaceId);
  if (!workspace) return [];
  return Array.from(computeEnabledFeatures(workspace.plan, workspace.featureOverrides));
}

/**
 * Full feature matrix for admin UI. Single query.
 */
export async function getWorkspaceFeaturesDetailed(workspaceId: string): Promise<DetailedFeature[]> {
  const workspace = await resolveWorkspace(workspaceId);
  if (!workspace) return [];

  const planDefaults = getDefaultFeatures(workspace.plan);
  const now = new Date();

  return FEATURE_CATALOG.map((feature) => {
    const override = workspace.featureOverrides.find((o) => o.feature === feature.id);
    const isInPlan = planDefaults.includes(feature.id);
    const isExpired = override?.expiresAt != null && now > override.expiresAt;

    let enabled: boolean;
    let source: "plan" | "granted" | "revoked" | "expired";

    if (override && !isExpired) {
      enabled = override.enabled;
      source = override.enabled ? "granted" : "revoked";
    } else if (override && isExpired) {
      enabled = isInPlan;
      source = "expired";
    } else {
      enabled = isInPlan;
      source = "plan";
    }

    return {
      ...feature,
      enabled,
      source,
      override: override
        ? { grantedBy: override.grantedBy, grantedAt: override.grantedAt, expiresAt: override.expiresAt, note: override.note }
        : null,
    };
  });
}
