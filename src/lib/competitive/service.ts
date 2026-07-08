/**
 * RegLayer — Competitive Intelligence Service
 *
 * Pure business logic for competitive accessibility benchmarking.
 * Scans competitor websites, stores snapshots, and computes rankings.
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { executeScanPipeline } from "@/lib/scanner/pipelines/scanPipeline";
import { logger } from "@/lib/telemetry/logger";
import type { ScanResult, AccessibilityViolation } from "@/lib/types";

const log = logger.withContext({ service: "competitiveIntel" });

export interface CompetitorWithLatest {
  id: string;
  url: string;
  name: string | null;
  industry: string | null;
  createdAt: Date;
  latestSnapshot: {
    score: number;
    totalViolations: number;
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
    pageTitle: string | null;
    topIssues: unknown;
    scannedAt: Date;
  } | null;
  trend: number | null; // score delta from previous snapshot
}

export interface BenchmarkResult {
  yourScore: number | null;
  yourRank: number;
  totalCompetitors: number;
  leaderboard: Array<{
    name: string;
    url: string;
    score: number;
    change: number | null;
    isYou: boolean;
  }>;
  industryAverage: number | null;
}

/**
 * List all competitors for a workspace with their latest snapshot and trend.
 */
export async function listCompetitors(workspaceId: string): Promise<CompetitorWithLatest[]> {
  const competitors = await prisma.competitor.findMany({
    where: { workspaceId },
    include: {
      snapshots: {
        orderBy: { scannedAt: "desc" },
        take: 2,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return competitors.map((c) => {
    const latest = c.snapshots[0] || null;
    const previous = c.snapshots[1] || null;
    const trend = latest && previous ? latest.score - previous.score : null;

    return {
      id: c.id,
      url: c.url,
      name: c.name,
      industry: c.industry,
      createdAt: c.createdAt,
      latestSnapshot: latest
        ? {
            score: latest.score,
            totalViolations: latest.totalViolations,
            critical: latest.critical,
            serious: latest.serious,
            moderate: latest.moderate,
            minor: latest.minor,
            pageTitle: latest.pageTitle,
            topIssues: latest.topIssues,
            scannedAt: latest.scannedAt,
          }
        : null,
      trend,
    };
  });
}

/**
 * Add a competitor to a workspace.
 */
export async function addCompetitor(
  workspaceId: string,
  url: string,
  name?: string,
  industry?: string,
  addedBy?: string
) {
  // Normalize URL
  const normalizedUrl = normalizeUrl(url);

  const competitor = await prisma.competitor.create({
    data: {
      workspaceId,
      url: normalizedUrl,
      name: name || null,
      industry: industry || null,
      addedBy: addedBy || null,
    },
  });

  return competitor;
}

/**
 * Remove a competitor from a workspace.
 */
export async function removeCompetitor(workspaceId: string, competitorId: string) {
  await prisma.competitor.delete({
    where: { id: competitorId, workspaceId },
  });
}

/**
 * Scan a single competitor and store the snapshot.
 * Uses the same scan pipeline as regular scans but doesn't persist a full Scan record.
 */
export async function scanCompetitor(competitorId: string): Promise<{ score: number; violations: number }> {
  const competitor = await prisma.competitor.findUniqueOrThrow({
    where: { id: competitorId },
  });

  log.info("Scanning competitor", { url: competitor.url, competitorId });

  const result: ScanResult = await executeScanPipeline(competitor.url);

  if (result.status !== "completed") {
    throw new Error(`Competitor scan failed for ${competitor.url}: ${result.status}`);
  }

  // Extract top issues from violations
  const issueCounts: Record<string, number> = {};
  for (const v of result.violations || []) {
    issueCounts[v.id] = (issueCounts[v.id] || 0) + 1;
  }
  const topIssues = Object.entries(issueCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([ruleId, count]) => ({ ruleId, count }));

  // Count by severity
  const violations: AccessibilityViolation[] = result.violations || [];
  const critical = violations.filter((v) => v.impact === "critical").length;
  const serious = violations.filter((v) => v.impact === "serious").length;
  const moderate = violations.filter((v) => v.impact === "moderate").length;
  const minor = violations.filter((v) => v.impact === "minor").length;

  const score = result.summary.score;

  // Update competitor name from page title if not set
  if (!competitor.name && result.metadata?.pageTitle) {
    await prisma.competitor.update({
      where: { id: competitorId },
      data: { name: String(result.metadata.pageTitle) },
    });
  }

  // Store snapshot
  const snapshot = await prisma.competitorSnapshot.create({
    data: {
      competitorId,
      url: competitor.url,
      score,
      totalViolations: violations.length,
      critical,
      serious,
      moderate,
      minor,
      pageTitle: result.metadata?.pageTitle ? String(result.metadata.pageTitle) : null,
      topIssues,
    },
  });

  log.info("Competitor scan complete", {
    competitorId,
    url: competitor.url,
    score: snapshot.score,
    violations: snapshot.totalViolations,
  });

  return { score: snapshot.score, violations: snapshot.totalViolations };
}

/**
 * Scan ALL competitors in a workspace (batch operation).
 */
export async function scanAllCompetitors(workspaceId: string) {
  const competitors = await prisma.competitor.findMany({
    where: { workspaceId },
  });

  const results: Array<{ id: string; url: string; score?: number; error?: string }> = [];

  for (const competitor of competitors) {
    try {
      const { score } = await scanCompetitor(competitor.id);
      results.push({ id: competitor.id, url: competitor.url, score });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      log.error("Competitor scan failed", { competitorId: competitor.id, error: message });
      results.push({ id: competitor.id, url: competitor.url, error: message });
    }
  }

  return results;
}

/**
 * Compute a benchmark leaderboard: your site vs competitors.
 */
export async function getBenchmark(workspaceId: string, yourSiteUrl?: string): Promise<BenchmarkResult> {
  // Get your latest score
  let yourScore: number | null = null;
  if (yourSiteUrl) {
    const yourScan = await prisma.scan.findFirst({
      where: { workspaceId, url: yourSiteUrl, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: { score: true },
    });
    yourScore = yourScan?.score ?? null;
  } else {
    // Use average of workspace's most recent scans
    const recentScans = await prisma.scan.findMany({
      where: { workspaceId, status: "COMPLETED", score: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { score: true },
    });
    if (recentScans.length > 0) {
      yourScore = recentScans.reduce((sum, s) => sum + (s.score || 0), 0) / recentScans.length;
    }
  }

  // Get competitors with latest snapshots
  const competitors = await prisma.competitor.findMany({
    where: { workspaceId },
    include: {
      snapshots: {
        orderBy: { scannedAt: "desc" },
        take: 2,
      },
    },
  });

  // Build leaderboard entries
  const entries: BenchmarkResult["leaderboard"] = [];

  // Add "You" entry
  if (yourScore !== null) {
    entries.push({
      name: "Your Site",
      url: yourSiteUrl || "",
      score: Math.round(yourScore * 10) / 10,
      change: null,
      isYou: true,
    });
  }

  // Add competitors
  for (const c of competitors) {
    const latest = c.snapshots[0];
    if (!latest) continue;
    const previous = c.snapshots[1];
    entries.push({
      name: c.name || new URL(c.url).hostname,
      url: c.url,
      score: Math.round(latest.score * 10) / 10,
      change: previous ? Math.round((latest.score - previous.score) * 10) / 10 : null,
      isYou: false,
    });
  }

  // Sort by score descending
  entries.sort((a, b) => b.score - a.score);

  // Find your rank
  const yourRank = entries.findIndex((e) => e.isYou) + 1;

  // Industry average (competitors only)
  const competitorScores = entries.filter((e) => !e.isYou).map((e) => e.score);
  const industryAverage =
    competitorScores.length > 0
      ? Math.round((competitorScores.reduce((s, v) => s + v, 0) / competitorScores.length) * 10) / 10
      : null;

  return {
    yourScore: yourScore !== null ? Math.round(yourScore * 10) / 10 : null,
    yourRank: yourRank || entries.length + 1,
    totalCompetitors: competitors.length,
    leaderboard: entries,
    industryAverage,
  };
}

/**
 * Get historical score data for a competitor (for charts).
 */
export async function getCompetitorHistory(competitorId: string, days = 90) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const snapshots = await prisma.competitorSnapshot.findMany({
    where: {
      competitorId,
      scannedAt: { gte: since },
    },
    orderBy: { scannedAt: "asc" },
    select: {
      score: true,
      totalViolations: true,
      scannedAt: true,
    },
  });

  return snapshots;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeUrl(raw: string): string {
  let url = raw.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }
  // Remove trailing slash for consistency
  return url.replace(/\/+$/, "");
}
