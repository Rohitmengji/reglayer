/**
 * ---------------------------------------------------------
 * RegLayer — Fix Priority Engine
 * ---------------------------------------------------------
 * 
 * Intelligent prioritization system that answers:
 * "What should I fix FIRST to maximize my score?"
 * 
 * Factors:
 * - Impact severity weight (critical = 4x, serious = 3x, etc.)
 * - Element count (more affected = higher priority)
 * - Score uplift estimation
 * - Fix difficulty estimation (based on rule patterns)
 * - WCAG level (A > AA > AAA priority)
 * 
 * This is what separates RegLayer from every other scanner:
 * We don't just find problems — we tell you exactly how to
 * fix them in the optimal order for maximum ROI.
 * ---------------------------------------------------------
 */

import { prisma } from "@/lib/database/prisma";

export interface PrioritizedFix {
  rank: number;
  ruleId: string;
  impact: string;
  description: string;
  help: string;
  helpUrl: string | null;
  affectedElementCount: number;
  estimatedScoreUplift: number;
  fixDifficulty: "trivial" | "easy" | "moderate" | "complex";
  estimatedMinutes: number;
  wcagCriteria: string[];
  wcagLevel: string;
  category: string;
  quickWin: boolean;
  recurrenceRate: number; // how often this violation appears across scans
}

export interface PriorityReport {
  scanId: string;
  currentScore: number;
  projectedScoreAfterAll: number;
  totalEstimatedMinutes: number;
  quickWins: PrioritizedFix[];
  highImpact: PrioritizedFix[];
  allFixes: PrioritizedFix[];
}

const IMPACT_WEIGHT: Record<string, number> = {
  critical: 10,
  serious: 6,
  moderate: 3,
  minor: 1,
};

const DIFFICULTY_MAP: Record<string, { difficulty: PrioritizedFix["fixDifficulty"]; minutes: number }> = {
  "color-contrast": { difficulty: "easy", minutes: 15 },
  "image-alt": { difficulty: "trivial", minutes: 5 },
  "label": { difficulty: "easy", minutes: 10 },
  "button-name": { difficulty: "trivial", minutes: 5 },
  "link-name": { difficulty: "trivial", minutes: 5 },
  "html-has-lang": { difficulty: "trivial", minutes: 2 },
  "document-title": { difficulty: "trivial", minutes: 2 },
  "meta-viewport": { difficulty: "trivial", minutes: 2 },
  "heading-order": { difficulty: "easy", minutes: 10 },
  "list": { difficulty: "easy", minutes: 10 },
  "aria-hidden-focus": { difficulty: "moderate", minutes: 30 },
  "aria-valid-attr": { difficulty: "easy", minutes: 10 },
  "bypass": { difficulty: "moderate", minutes: 20 },
  "frame-title": { difficulty: "trivial", minutes: 5 },
  "landmark-one-main": { difficulty: "easy", minutes: 10 },
  "region": { difficulty: "moderate", minutes: 25 },
  "duplicate-id": { difficulty: "moderate", minutes: 20 },
  "tabindex": { difficulty: "easy", minutes: 10 },
};

const CATEGORY_MAP: Record<string, string> = {
  "color-contrast": "Visual Design",
  "image-alt": "Images & Media",
  "label": "Forms",
  "button-name": "Interactive Elements",
  "link-name": "Navigation",
  "html-has-lang": "Document Structure",
  "document-title": "Document Structure",
  "meta-viewport": "Document Structure",
  "heading-order": "Content Structure",
  "list": "Content Structure",
  "aria-hidden-focus": "ARIA",
  "aria-valid-attr": "ARIA",
  "bypass": "Navigation",
  "frame-title": "Frames & Embeds",
  "landmark-one-main": "Landmarks",
  "region": "Landmarks",
  "duplicate-id": "HTML Quality",
  "tabindex": "Keyboard Access",
};

function getWcagLevel(tags: string[]): string {
  if (tags.some((t) => t.includes("wcag2a") && !t.includes("wcag2aa"))) return "A";
  if (tags.some((t) => t.includes("wcag2aa"))) return "AA";
  if (tags.some((t) => t.includes("wcag2aaa"))) return "AAA";
  return "A";
}

function getWcagCriteria(tags: string[]): string[] {
  return tags.filter((t) => /^wcag\d+$/.test(t) || t.startsWith("wcag2"));
}

/**
 * Scope for recurrence calculations — limits cross-scan aggregates to a single
 * tenant. Prefer `workspaceId`; fall back to `userId` for legacy scans whose
 * workspace was never set. If neither is available, recurrence is skipped.
 */
export interface PriorityReportScope {
  workspaceId?: string | null;
  userId?: string | null;
}

/**
 * Generate a prioritized fix report for a scan.
 *
 * `scope` bounds recurrence aggregates to the caller's tenant so one tenant's
 * violation frequencies never bleed into another's report.
 */
export async function generatePriorityReport(
  scanId: string,
  scope: PriorityReportScope = {}
): Promise<PriorityReport> {
  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    include: { violations: true },
  });

  if (!scan) {
    throw new Error(`Scan ${scanId} not found`);
  }

  // Scope recurrence to the tenant: workspace if set, else the owning user.
  const scanScope = scope.workspaceId
    ? { workspaceId: scope.workspaceId }
    : scope.userId
      ? { userId: scope.userId }
      : null;

  // Get recurrence data: how often each rule appears across the tenant's scans.
  // Without a scope we skip recurrence entirely rather than leak global data.
  let recurrenceMap = new Map<string, number>();
  let totalScans = 0;
  if (scanScope) {
    const [recurrenceData, scanCount] = await Promise.all([
      prisma.violation.groupBy({
        by: ["ruleId"],
        where: { scan: scanScope },
        _count: { ruleId: true },
      }),
      prisma.scan.count({ where: scanScope }),
    ]);
    recurrenceMap = new Map(recurrenceData.map((r) => [r.ruleId, r._count.ruleId]));
    totalScans = scanCount;
  }

  const currentScore = scan.score ?? 0;
  const totalViolations = scan.violations.length;

  // Score uplift estimation: each violation contributes proportionally
  const baseUpliftPerViolation = totalViolations > 0 ? (100 - currentScore) / totalViolations : 0;

  const fixes: PrioritizedFix[] = scan.violations.map((v) => {
    const elements = Array.isArray(v.affectedElements) ? (v.affectedElements as unknown[]).length : 1;
    const impactWeight = IMPACT_WEIGHT[v.impact] || 1;
    const difficultyInfo = DIFFICULTY_MAP[v.ruleId] || { difficulty: "moderate" as const, minutes: 20 };
    const wcagLevel = getWcagLevel(v.tags);
    const wcagLevelWeight = wcagLevel === "A" ? 3 : wcagLevel === "AA" ? 2 : 1;

    // Score uplift considers impact, element count, and WCAG level
    const uplift = Math.round(baseUpliftPerViolation * impactWeight * wcagLevelWeight * 10) / 10;

    const recurrence = recurrenceMap.get(v.ruleId) || 1;
    const recurrenceRate = totalScans > 0 ? Math.round((recurrence / totalScans) * 100) : 0;

    return {
      rank: 0, // will be set after sorting
      ruleId: v.ruleId,
      impact: v.impact,
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      affectedElementCount: elements,
      estimatedScoreUplift: Math.min(uplift, 100 - currentScore),
      fixDifficulty: difficultyInfo.difficulty,
      estimatedMinutes: difficultyInfo.minutes * Math.min(elements, 5),
      wcagCriteria: getWcagCriteria(v.tags),
      wcagLevel,
      category: CATEGORY_MAP[v.ruleId] || "Other",
      quickWin: difficultyInfo.difficulty === "trivial" && impactWeight >= 3,
      recurrenceRate,
    };
  });

  // Sort by ROI: score uplift per minute of effort
  fixes.sort((a, b) => {
    const roiA = a.estimatedScoreUplift / Math.max(a.estimatedMinutes, 1);
    const roiB = b.estimatedScoreUplift / Math.max(b.estimatedMinutes, 1);
    return roiB - roiA;
  });

  // Assign ranks
  fixes.forEach((f, i) => {
    f.rank = i + 1;
  });

  const projectedScore = Math.min(
    100,
    currentScore + fixes.reduce((sum, f) => sum + f.estimatedScoreUplift, 0)
  );

  return {
    scanId,
    currentScore,
    projectedScoreAfterAll: Math.round(projectedScore * 10) / 10,
    totalEstimatedMinutes: fixes.reduce((sum, f) => sum + f.estimatedMinutes, 0),
    quickWins: fixes.filter((f) => f.quickWin),
    highImpact: fixes.filter((f) => f.estimatedScoreUplift >= 5).slice(0, 5),
    allFixes: fixes,
  };
}
