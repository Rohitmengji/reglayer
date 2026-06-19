/**
 * Plan limits configuration for RegLayer.
 * Defines what each plan tier includes.
 */

export const PLAN_LIMITS = {
  FREE: {
    aiCredits: 25,
    scansPerMonth: 3,
    pagesPerScan: 5,
    teamMembers: 2,
    auditLogDays: 7,
    features: {
      aiExplanations: true,
      aiFixSuggestions: false,
      aiInsights: "basic" as const, // top 3 only
      complianceReports: "summary" as const,
      scheduledScans: false,
      webhooks: 0,
      manualTesting: false,
    },
  },
  PRO: {
    aiCredits: 500,
    scansPerMonth: 30,
    pagesPerScan: 50,
    teamMembers: 10,
    auditLogDays: 90,
    features: {
      aiExplanations: true,
      aiFixSuggestions: true,
      aiInsights: "full" as const,
      complianceReports: "full" as const,
      scheduledScans: true,
      webhooks: 3,
      manualTesting: true,
    },
  },
  ENTERPRISE: {
    aiCredits: 2000,
    scansPerMonth: -1, // unlimited
    pagesPerScan: -1, // unlimited
    teamMembers: -1, // unlimited
    auditLogDays: 365,
    features: {
      aiExplanations: true,
      aiFixSuggestions: true,
      aiInsights: "full" as const,
      complianceReports: "full" as const,
      scheduledScans: true,
      webhooks: -1, // unlimited
      manualTesting: true,
    },
  },
} as const;

/**
 * Role-based scan limit overrides.
 *
 * Workspace Admins/Owners get elevated scan limits regardless of plan.
 * This ensures team leads and managers aren't blocked by plan constraints
 * while still maintaining finite budgets (master admins are unlimited separately).
 *
 * -1 means unlimited.
 */
export const ADMIN_SCAN_LIMITS: Record<string, number> = {
  FREE: 100,
  PRO: 200,
  ENTERPRISE: -1,
} as const;

/**
 * AI action credit costs
 */
export const AI_CREDIT_COSTS = {
  explanation: 1, // Explain a single issue
  fixSuggestion: 2, // Generate code fix
  pageSummary: 3, // AI summary of page issues
  insightsAnalysis: 5, // Full AI insights for a scan
  priorityRanking: 3, // AI-powered priority ranking
  complianceAssessment: 5, // AI compliance evaluation
  manualTestGuidance: 2, // AI-drafted manual test guidance per criterion
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;
export type AiAction = keyof typeof AI_CREDIT_COSTS;
