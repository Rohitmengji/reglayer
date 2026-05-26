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
    },
  },
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
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;
export type AiAction = keyof typeof AI_CREDIT_COSTS;
