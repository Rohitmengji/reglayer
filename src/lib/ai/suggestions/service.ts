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
  const latestScan = await getLastScan(workspaceId);
  const lastScanDate = latestScan?.createdAt;

  const [
    recentScans,
    violationStats,
    siteCount,
  ] = await Promise.all([
    getRecentScanStats(workspaceId),
    getViolationTrend(workspaceId, latestScan?.id),
    getSiteCount(workspaceId),
  ]);

  // 1. No scans yet — onboarding nudge
  if (recentScans.total === 0 && !lastScanDate) {
    suggestions.push({
      id: "onboarding-first-scan",
      title: "Run your first accessibility scan",
      description: "Start by scanning your homepage to get a baseline accessibility score and identify violations.",
      category: "action",
      priority: "high",
      actionLabel: "Start Scan",
      actionHref: "/dashboard#scan-url",
      dismissible: true,
    });
  }

  // 2. Score dropping — risk alert
  if (recentScans.total >= 2 && recentScans.trend === "declining") {
    suggestions.push({
      id: "score-declining",
      title: "Recent scans have a lower average score",
      description: `The average across scans is ${recentScans.currentAvg}, compared with ${recentScans.previousAvg} in the previous week. Different pages may have been scanned; review comparable results before concluding there is a regression.`,
      category: "risk",
      priority: "high",
      actionLabel: "Review Trends",
      actionHref: "/reports?tab=trends",
      metadata: { previousAvg: recentScans.previousAvg, currentAvg: recentScans.currentAvg },
      dismissible: false,
    });
  }

  // 3. Critical violations unresolved
  if (violationStats.criticalOpen > 0) {
    suggestions.push({
      id: "critical-violations",
      title: `${violationStats.criticalOpen} critical findings in your latest scan`,
      description: "Review the affected elements and user impact, then verify each fix with a new scan.",
      category: "compliance",
      priority: "critical",
      actionLabel: "Fix Critical Issues",
      actionHref: `/violations?scanId=${encodeURIComponent(latestScan!.id)}&impact=critical&status=OPEN`,
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
      title: `${violationStats.easyFixes} lower-severity findings to review`,
      description: "These minor and moderate findings are open in your latest scan. Review their evidence and effort before planning remediation.",
      category: "insight",
      priority: "medium",
      actionLabel: "Review Findings",
      actionHref: `/violations?scanId=${encodeURIComponent(latestScan!.id)}&impact=minor,moderate&status=OPEN`,
      metadata: { easyFixes: violationStats.easyFixes },
      dismissible: true,
    });
  }

  // Sort by priority
  const priorityOrder: Record<SuggestionPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return suggestions.slice(0, 3);
}

// ── Data Fetchers ─────────────────────────────────────────────────────────────

async function getRecentScanStats(workspaceId: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const [recent, previous] = await Promise.all([
    prisma.scan.findMany({
      where: { workspaceId, status: "COMPLETED", score: { not: null }, createdAt: { gte: sevenDaysAgo } },
      select: { score: true, totalViolations: true },
    }),
    prisma.scan.findMany({
      where: { workspaceId, status: "COMPLETED", score: { not: null }, createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
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

async function getViolationTrend(workspaceId: string, scanId?: string) {
  if (!scanId) return { criticalOpen: 0, easyFixes: 0 };
  const [critical, easy] = await Promise.all([
    prisma.violation.count({
      where: {
        scan: { workspaceId },
        scanId,
        impact: "critical",
        status: "OPEN",
      },
    }),
    prisma.violation.count({
      where: {
        scan: { workspaceId },
        scanId,
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

async function getLastScan(workspaceId: string) {
  const scan = await prisma.scan.findFirst({
    where: { workspaceId, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });
  return scan;
}

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}
