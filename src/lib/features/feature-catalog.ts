/**
 * RegLayer — Feature Catalog & Plan-Based Gating
 *
 * WHY: Different workspace plans get different product modules.
 *      Master admin can override per workspace (enable extras or disable defaults).
 *
 * WHAT: Defines all gatable product features, their plan defaults, and sidebar mapping.
 *
 * HOW: Each feature has an ID, display name, description, and which plans include it.
 *      The sidebar and API routes check workspace access via `hasFeature()`.
 *
 * BUSINESS LOGIC:
 * - FREE: Core scanning + basic dashboard (enough to see value)
 * - PRO: Adds trends, violations mgmt, compliance, integrations, export
 * - ENTERPRISE: Full platform — executive, agency, automation, API, risk scoring
 * - Master admin can grant/revoke any feature per workspace (sales flexibility)
 * - Expired trial features auto-disable (checked at access time)
 */

export interface FeatureDefinition {
  id: string;
  name: string;
  description: string;
  category: "core" | "analytics" | "compliance" | "automation" | "enterprise";
  plans: ("FREE" | "PRO" | "ENTERPRISE")[];
}

/**
 * All gatable features in RegLayer.
 * Sidebar items map to these IDs.
 */
export const FEATURE_CATALOG: FeatureDefinition[] = [
  // ─── Core (always available) ───────────────────
  {
    id: "dashboard",
    name: "Dashboard",
    description: "Overview stats, recent scans, accessibility score",
    category: "core",
    plans: ["FREE", "PRO", "ENTERPRISE"],
  },
  {
    id: "scans",
    name: "Scans",
    description: "Run accessibility scans and view history",
    category: "core",
    plans: ["FREE", "PRO", "ENTERPRISE"],
  },
  {
    id: "settings",
    name: "Settings",
    description: "Profile, workspace, and notification preferences",
    category: "core",
    plans: ["FREE", "PRO", "ENTERPRISE"],
  },

  // ─── Analytics (PRO+) ─────────────────────────
  {
    id: "violations",
    name: "Violations Manager",
    description: "Track, triage, and manage violations across scans",
    category: "analytics",
    plans: ["PRO", "ENTERPRISE"],
  },
  {
    id: "trends",
    name: "Trends",
    description: "Historical score trends and regression detection",
    category: "analytics",
    plans: ["PRO", "ENTERPRISE"],
  },
  {
    id: "crawl",
    name: "Site Crawl",
    description: "Multi-page crawl with depth and concurrency controls",
    category: "analytics",
    plans: ["PRO", "ENTERPRISE"],
  },

  // ─── Compliance (PRO+) ────────────────────────
  {
    id: "compliance",
    name: "Compliance Matrix",
    description: "WCAG 2.1 AA/AAA compliance tracking and VPAT generation",
    category: "compliance",
    plans: ["PRO", "ENTERPRISE"],
  },
  {
    id: "analysis",
    name: "Analysis",
    description: "Screen reader simulation, color contrast, and detailed audits",
    category: "compliance",
    plans: ["PRO", "ENTERPRISE"],
  },

  // ─── Automation (Enterprise) ──────────────────
  {
    id: "automation",
    name: "Automation",
    description: "Auto-remediation, CI/CD integration, scheduled scans",
    category: "automation",
    plans: ["ENTERPRISE"],
  },
  {
    id: "manage",
    name: "Manage",
    description: "Team management, API keys, webhooks, integrations",
    category: "automation",
    plans: ["PRO", "ENTERPRISE"],
  },

  // ─── Enterprise-only ──────────────────────────
  {
    id: "executive",
    name: "Executive Dashboard",
    description: "Portfolio-level compliance KPIs for leadership",
    category: "enterprise",
    plans: ["ENTERPRISE"],
  },
  {
    id: "agency",
    name: "Agency Platform",
    description: "White-label scanning for client workspaces",
    category: "enterprise",
    plans: ["ENTERPRISE"],
  },
];

/**
 * Get default features for a plan tier.
 */
export function getDefaultFeatures(plan: "FREE" | "PRO" | "ENTERPRISE"): string[] {
  return FEATURE_CATALOG.filter((f) => f.plans.includes(plan)).map((f) => f.id);
}

/**
 * Check if a feature is included in a plan by default.
 */
export function isPlanFeature(featureId: string, plan: "FREE" | "PRO" | "ENTERPRISE"): boolean {
  const feature = FEATURE_CATALOG.find((f) => f.id === featureId);
  return feature ? feature.plans.includes(plan) : false;
}

/**
 * Map of sidebar items to feature IDs.
 * Only items with a feature gate are listed — unlisted items are always shown.
 */
export const SIDEBAR_FEATURE_MAP: Record<string, string> = {
  "/dashboard": "dashboard",
  "/scans": "scans",
  "/violations": "violations",
  "/trends": "trends",
  "/crawl": "crawl",
  "/compliance": "compliance",
  "/analysis": "analysis",
  "/manual-testing": "manualTesting",
  "/automation": "automation",
  "/manage": "manage",
  "/executive": "executive",
  "/agency": "agency",
  "/settings": "settings",
};
