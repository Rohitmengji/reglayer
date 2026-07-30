/**
 * Plan limits configuration for RegLayer.
 * Defines what each plan tier includes.
 */

export const PLAN_LIMITS = {
  FREE: {
    aiCredits: 25,
    chatMessagesPerDay: 30,
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
      deepScan: false,
    },
  },
  PRO: {
    aiCredits: 500,
    chatMessagesPerDay: 300,
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
      deepScan: true,
    },
  },
  ENTERPRISE: {
    aiCredits: 2000,
    chatMessagesPerDay: -1, // unlimited
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
      deepScan: true,
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
 *
 * Chat is deliberately absent. Credits are the budget for the expensive, deliberate
 * actions a user takes on a scan; a FREE user only has 25 of them and one
 * `insightsAnalysis` costs 5. Billing conversation from the same pool would let a
 * user talk away the budget they need for the actual product. Chat is metered
 * separately by `chatMessagesPerDay` — free-feeling, but still bounded, because an
 * uncapped model endpoint behind free signup is just a free LLM proxy.
 */
export const AI_CREDIT_COSTS = {
  explanation: 1, // Explain a single issue
  fixSuggestion: 2, // Generate code fix
  pageSummary: 3, // AI summary of page issues
  insightsAnalysis: 5, // Full AI insights for a scan
  priorityRanking: 3, // AI-powered priority ranking
  complianceAssessment: 5, // AI compliance evaluation
  manualTestGuidance: 2, // AI-drafted manual test guidance per criterion
  visualScan: 4, // Vision-model review of a page screenshot
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;
export type AiAction = keyof typeof AI_CREDIT_COSTS;
