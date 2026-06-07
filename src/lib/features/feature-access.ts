/**
 * RegLayer — Feature Access Control
 *
 * WHY: Gating product modules per workspace based on plan + master admin overrides.
 *
 * WHAT: `hasFeature(workspaceId, featureId)` — single function to check access.
 *       `getWorkspaceFeatures(workspaceId)` — returns all enabled features for sidebar.
 *
 * HOW:
 * 1. Check workspace plan → get default features for that plan
 * 2. Check WorkspaceFeature overrides (master admin grants/revokes)
 * 3. Check expiration on granted features
 * 4. Return final boolean
 *
 * Master admins bypass all feature gates.
 */

import { prisma } from "@/lib/database/prisma";
import { getDefaultFeatures, FEATURE_CATALOG } from "./feature-catalog";

interface FeatureAccessResult {
  enabled: boolean;
  reason: "plan_default" | "admin_granted" | "admin_revoked" | "expired" | "not_in_plan";
}

/**
 * Check if a workspace has access to a specific feature.
 */
export async function hasFeature(
  workspaceId: string,
  featureId: string
): Promise<FeatureAccessResult> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true },
  });

  if (!workspace) {
    return { enabled: false, reason: "not_in_plan" };
  }

  const planDefault = getDefaultFeatures(workspace.plan);
  const isInPlan = planDefault.includes(featureId);

  // Check for override
  const override = await prisma.workspaceFeature.findUnique({
    where: { workspaceId_feature: { workspaceId, feature: featureId } },
  });

  if (override) {
    // Check expiration
    if (override.expiresAt && new Date() > override.expiresAt) {
      return { enabled: false, reason: "expired" };
    }
    if (override.enabled) {
      return { enabled: true, reason: "admin_granted" };
    }
    return { enabled: false, reason: "admin_revoked" };
  }

  // No override — use plan default
  return { enabled: isInPlan, reason: isInPlan ? "plan_default" : "not_in_plan" };
}

/**
 * Get all enabled features for a workspace.
 * Returns feature IDs that are accessible (plan default + overrides - revocations - expired).
 */
export async function getWorkspaceFeatures(workspaceId: string): Promise<string[]> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true, featureOverrides: true },
  });

  if (!workspace) return [];

  const planDefaults = new Set(getDefaultFeatures(workspace.plan));

  // Apply overrides
  for (const override of workspace.featureOverrides) {
    if (override.expiresAt && new Date() > override.expiresAt) {
      // Expired grant — treat as not having it
      planDefaults.delete(override.feature);
      continue;
    }
    if (override.enabled) {
      planDefaults.add(override.feature);
    } else {
      planDefaults.delete(override.feature);
    }
  }

  return Array.from(planDefaults);
}

/**
 * Get features with full metadata for admin UI.
 */
export async function getWorkspaceFeaturesDetailed(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true, featureOverrides: true },
  });

  if (!workspace) return [];

  const planDefaults = getDefaultFeatures(workspace.plan);

  return FEATURE_CATALOG.map((feature) => {
    const override = workspace.featureOverrides.find((o) => o.feature === feature.id);
    const isInPlan = planDefaults.includes(feature.id);
    const isExpired = override?.expiresAt ? new Date() > override.expiresAt : false;

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
        ? {
            grantedBy: override.grantedBy,
            grantedAt: override.grantedAt,
            expiresAt: override.expiresAt,
            note: override.note,
          }
        : null,
    };
  });
}
