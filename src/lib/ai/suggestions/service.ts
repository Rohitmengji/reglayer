/**
 * RegLayer — Proactive AI Suggestions Service
 *
 * WHY: Instead of waiting for users to ask, the AI should INITIATE — surface
 *      insights, warn about risks, suggest next actions based on workspace data.
 * WHAT: Generates contextual suggestions based on recent scans, violation trends,
 *       compliance gaps, and user behavior patterns.
 * HOW: Runs on dashboard load (cached 1hr), analyzes workspace state, returns
 *       prioritized suggestion cards.
 *
 * INSPIRED BY:
 *   - GitHub Copilot's inline suggestions (anticipate what you need)
 *   - Google Now cards (proactive contextual info)
 *   - Linear's inbox (prioritized actionable items)
 *   - Notion AI's "what to do next" prompts
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SuggestionPriority = "critical" | "high" | "medium" | "low";
export type SuggestionCategory = "risk" | "compliance" | "performance" | "action" | "insight";

export interface ProactiveSuggestion {
  id: string;
  title: string;
  description: string;
  category: SuggestionCategory;
  priority: SuggestionPriority;
  actionLabel?: string;
  actionHref?: string;
  metadata?: Record<string, unknown>;
  dismissible: boolean;
}

// ── Suggestion Generators ─────────────────────────────────────────────────────

/**
 * Generate proactive suggestions for a workspace based on current state.
 * Each generator analyzes one aspect and returns 0+ suggestions.
 */
export async function generateSuggestions(workspaceId: string): Promise<ProactiveSuggestion[]> {
  const suggestions: ProactiveSuggestion[] = [];

  const [
    recentScans,
    violationStats,
    siteCount,
    lastScanDate,
  ] = await Promise.all([
    getRecentScanStats(workspaceId),
    getViolationTrend(workspaceId),
    getSiteCount(workspaceId),
    getLastScanDate(workspaceId),
  ]);

  // 1. No scans yet — onboarding nudge
  if (recentScans.total === 0) {
    suggestions.push({
      id: "onboarding-first-scan",
      title: "Run your first accessibility scan",
      description: "Start by scanning your homepage to get a baseline accessibility score and identify violations.",
      category: "action",
      priority: "high",
      actionLabel: "Start Scan",
      actionHref: "/test?tab=scans",
      dismissible: true,
    });
  }

  // 2. Score dropping — risk alert
  if (recentScans.total >= 2 && recentScans.trend === "declining") {
    suggestions.push({
      id: "score-declining",
      title: "Accessibility score is declining",
      description: `Your average score dropped from ${recentScans.previousAvg} to ${recentScans.currentAvg} in the last 7 days. ${recentScans.newViolations} new violations detected.`,
      category: "risk",
      priority: "critical",
      actionLabel: "View Violations",
      actionHref: "/violations",
      metadata: { previousAvg: recentScans.previousAvg, currentAvg: recentScans.currentAvg },
      dismissible: false,
    });
  }

  // 3. Critical violations unresolved
  if (violationStats.criticalOpen > 0) {
    suggestions.push({
      id: "critical-violations",
      title: `${violationStats.criticalOpen} critical violations need attention`,
      description: "Critical violations block keyboard users and screen reader users entirely. These should be your top priority.",
      category: "compliance",
      priority: "critical",
      actionLabel: "Fix Critical Issues",
      actionHref: "/violations?impact=critical&status=open",
      metadata: { count: violationStats.criticalOpen },
      dismissible: false,
    });
  }

  // 4. Stale scans — haven't scanned in 7+ days
  if (lastScanDate && daysSince(lastScanDate) > 7 && siteCount > 0) {
    suggestions.push({
      id: "stale-scans",
      title: "Your scans are getting stale",
      description: `It's been ${daysSince(lastScanDate)} days since your last scan. Websites change — new code deploys can introduce accessibility issues.`,
      category: "action",
      priority: "medium",
      actionLabel: "Re-scan Sites",
      actionHref: "/test?tab=scans",
      dismissible: true,
    });
  }

  // 5. Score improvement opportunity
  if (recentScans.total > 0 && recentScans.currentAvg < 90 && violationStats.easyFixes > 5) {
    suggestions.push({
      id: "quick-wins",
      title: `${violationStats.easyFixes} easy fixes available`,
      description: "These violations have automated code fixes that could boost your score by 10-20 points in under an hour.",
      category: "insight",
      priority: "medium",
      actionLabel: "View Quick Fixes",
      actionHref: "/violations?impact=minor,moderate&status=open",
      metadata: { easyFixes: violationStats.easyFixes },
      dismissible: true,
    });
  }

  // 6. Compliance deadline approaching (EAA June 2025 is passed, but others)
  suggestions.push({
    id: "compliance-check",
    title: "Review your compliance posture",
    description: "Regulations are tightening. Review your WCAG 2.2 AA compliance status and ensure all critical user flows pass.",
    category: "compliance",
    priority: "low",
    actionLabel: "Compliance Matrix",
    actionHref: "/compliance?tab=matrix",
    dismissible: true,
  });

  // 7. Multiple sites but no monitoring
  if (siteCount >= 3 && recentScans.total < siteCount) {
    suggestions.push({
      id: "setup-monitoring",
      title: "Set up continuous monitoring",
      description: `You have ${siteCount} sites but only ${recentScans.total} recent scans. Enable scheduled scanning to catch regressions automatically.`,
      category: "action",
      priority: "medium",
      actionLabel: "Configure Schedules",
      actionHref: "/automation?tab=schedules",
      dismissible: true,
    });
  }

  // Sort by priority
  const priorityOrder: Record<SuggestionPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return suggestions.slice(0, 5); // Max 5 suggestions
}

// ── Data Fetchers ─────────────────────────────────────────────────────────────

async function getRecentScanStats(workspaceId: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const [recent, previous] = await Promise.all([
    prisma.scan.findMany({
      where: { workspaceId, createdAt: { gte: sevenDaysAgo } },
      select: { score: true, totalViolations: true },
    }),
    prisma.scan.findMany({
      where: { workspaceId, createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
      select: { score: true, totalViolations: true },
    }),
  ]);

  const currentAvg = recent.length > 0
    ? Math.round(recent.reduce((sum, s) => sum + (s.score ?? 0), 0) / recent.length)
    : 0;
  const previousAvg = previous.length > 0
    ? Math.round(previous.reduce((sum, s) => sum + (s.score ?? 0), 0) / previous.length)
    : 0;

  const currentViolations = recent.reduce((sum, s) => sum + (s.totalViolations ?? 0), 0);
  const previousViolations = previous.reduce((sum, s) => sum + (s.totalViolations ?? 0), 0);

  return {
    total: recent.length,
    currentAvg,
    previousAvg,
    trend: currentAvg < previousAvg ? "declining" as const : "improving" as const,
    newViolations: Math.max(0, currentViolations - previousViolations),
  };
}

async function getViolationTrend(workspaceId: string) {
  const [critical, easy] = await Promise.all([
    prisma.violation.count({
      where: {
        scan: { workspaceId },
        impact: "critical",
        status: "OPEN",
      },
    }),
    prisma.violation.count({
      where: {
        scan: { workspaceId },
        impact: { in: ["minor", "moderate"] },
        status: "OPEN",
      },
    }),
  ]);

  return { criticalOpen: critical, easyFixes: easy };
}

async function getSiteCount(workspaceId: string) {
  return prisma.site.count({ where: { workspaceId } });
}

async function getLastScanDate(workspaceId: string): Promise<Date | null> {
  const scan = await prisma.scan.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return scan?.createdAt ?? null;
}

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}
