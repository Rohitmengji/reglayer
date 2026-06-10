/**
 * RegLayer — Smart Remediation Pipeline Engine
 *
 * INDUSTRY PROBLEM: Teams get 200+ violations dumped on them with no strategy.
 * Each violation listed individually leads to paralysis. In reality, many violations
 * share a root cause — fix ONE thing, resolve 50 violations across 12 pages.
 *
 * SOLUTION: Cluster violations by shared root cause, estimate effort/impact ratio,
 * and generate ordered "fix batches" that maximize compliance improvement per engineering hour.
 *
 * APPROACH:
 * 1. Group violations by ruleId + similar selectors (shared CSS class or component)
 * 2. Calculate "leverage score" = violations_resolved / estimated_fix_effort
 * 3. Detect component patterns (same class → same React component → fix once)
 * 4. Generate actionable fix batches with code suggestions
 * 5. Predict score improvement per batch
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";

export interface ViolationCluster {
  id: string;
  ruleId: string;
  ruleName: string;
  impact: string;
  rootCause: string;
  sharedPattern: string; // CSS selector, component name, or template pattern
  violationCount: number;
  affectedPages: number;
  affectedElements: number;
  leverageScore: number; // violations_resolved / effort_hours
  estimatedEffort: EffortEstimate;
  predictedScoreGain: number;
  fixStrategy: FixStrategy;
  violations: ClusteredViolation[];
}

export interface ClusteredViolation {
  id: string;
  url: string;
  selector: string;
  impact: string;
}

export interface EffortEstimate {
  hours: number;
  complexity: "trivial" | "simple" | "moderate" | "complex";
  skillLevel: "junior" | "mid" | "senior";
  category: "css" | "html" | "aria" | "javascript" | "content" | "design";
}

export interface FixStrategy {
  type: "single-file" | "component" | "global-css" | "content-update" | "design-system";
  description: string;
  codeHint: string;
  wcagCriteria: string[];
}

export interface RemediationPlan {
  scanId: string;
  url: string;
  totalViolations: number;
  totalClusters: number;
  batches: RemediationBatch[];
  projectedScore: number;
  currentScore: number;
  estimatedTotalHours: number;
}

export interface RemediationBatch {
  order: number;
  name: string;
  clusters: ViolationCluster[];
  totalViolationsResolved: number;
  estimatedHours: number;
  projectedScoreAfter: number;
  cumulativeImprovement: number;
}

// Effort estimation based on rule category
const EFFORT_MAP: Record<string, EffortEstimate> = {
  "image-alt": { hours: 0.5, complexity: "trivial", skillLevel: "junior", category: "content" },
  "color-contrast": { hours: 1, complexity: "simple", skillLevel: "mid", category: "css" },
  "label": { hours: 0.5, complexity: "simple", skillLevel: "junior", category: "html" },
  "input-label": { hours: 0.5, complexity: "simple", skillLevel: "junior", category: "html" },
  "link-name": { hours: 0.5, complexity: "trivial", skillLevel: "junior", category: "html" },
  "button-name": { hours: 0.5, complexity: "trivial", skillLevel: "junior", category: "html" },
  "heading-order": { hours: 1, complexity: "simple", skillLevel: "mid", category: "html" },
  "landmark-one-main": { hours: 0.5, complexity: "simple", skillLevel: "mid", category: "html" },
  "region": { hours: 1.5, complexity: "moderate", skillLevel: "mid", category: "html" },
  "aria-required-attr": { hours: 1, complexity: "moderate", skillLevel: "mid", category: "aria" },
  "aria-valid-attr-value": { hours: 1, complexity: "moderate", skillLevel: "mid", category: "aria" },
  "aria-hidden-focus": { hours: 2, complexity: "complex", skillLevel: "senior", category: "javascript" },
  "tabindex": { hours: 2, complexity: "complex", skillLevel: "senior", category: "javascript" },
  "focus-order": { hours: 3, complexity: "complex", skillLevel: "senior", category: "javascript" },
  "bypass": { hours: 1, complexity: "simple", skillLevel: "mid", category: "html" },
};

const DEFAULT_EFFORT: EffortEstimate = { hours: 1.5, complexity: "moderate", skillLevel: "mid", category: "html" };

// Score impact per violation type (points gained per violation fixed)
const SCORE_IMPACT: Record<string, number> = {
  "image-alt": 0.8,
  "color-contrast": 0.6,
  "label": 0.7,
  "link-name": 0.5,
  "button-name": 0.5,
  "heading-order": 0.3,
  "landmark-one-main": 0.4,
  "region": 0.3,
  "aria-required-attr": 0.4,
  "tabindex": 0.6,
  "bypass": 0.4,
};

/**
 * Generate a complete remediation plan for a scan.
 */
export async function generateRemediationPlan(scanId: string): Promise<RemediationPlan | null> {
  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    include: {
      violations: {
        select: {
          id: true,
          ruleId: true,
          impact: true,
          description: true,
          help: true,
          wcagCriteria: true,
          affectedElements: true,
        },
      },
    },
  });

  if (!scan || scan.violations.length === 0) return null;

  // Step 1: Cluster violations by ruleId + pattern
  const clusters = clusterViolations(scan.violations, scan.url);

  // Step 2: Sort by leverage score (max impact per effort hour)
  clusters.sort((a, b) => b.leverageScore - a.leverageScore);

  // Step 3: Group into batches (each batch = 4-8 hours of work)
  const batches = generateBatches(clusters, scan.score ?? 0);

  return {
    scanId: scan.id,
    url: scan.url,
    totalViolations: scan.violations.length,
    totalClusters: clusters.length,
    batches,
    projectedScore: batches.length > 0 ? batches[batches.length - 1].projectedScoreAfter : (scan.score ?? 0),
    currentScore: scan.score ?? 0,
    estimatedTotalHours: clusters.reduce((sum, c) => sum + c.estimatedEffort.hours, 0),
  };
}

function clusterViolations(
  violations: Array<{
    id: string;
    ruleId: string;
    impact: string;
    description: string;
    help: string;
    wcagCriteria: string | null;
    affectedElements: unknown;
  }>,
  scanUrl: string
): ViolationCluster[] {
  const ruleGroups = new Map<string, typeof violations>();

  for (const v of violations) {
    const existing = ruleGroups.get(v.ruleId) ?? [];
    existing.push(v);
    ruleGroups.set(v.ruleId, existing);
  }

  const clusters: ViolationCluster[] = [];

  for (const [ruleId, group] of ruleGroups) {
    // Extract selectors from affected elements to find shared patterns
    const selectors: string[] = [];
    let totalElements = 0;
    for (const v of group) {
      const elements = v.affectedElements as Array<{ target?: string[] }> | null;
      if (Array.isArray(elements)) {
        totalElements += elements.length;
        for (const el of elements) {
          if (el.target?.[0]) selectors.push(el.target[0]);
        }
      }
    }

    // Find shared CSS class pattern
    const sharedPattern = findSharedPattern(selectors);

    // Calculate effort
    const effort = EFFORT_MAP[ruleId] ?? DEFAULT_EFFORT;
    // Shared pattern means fix-once benefit: divide effort by leverage
    const effectiveEffort = sharedPattern.includes(".")
      ? { ...effort, hours: effort.hours * 1.5 } // One component fix
      : { ...effort, hours: effort.hours * group.length * 0.3 }; // Per-instance

    const violationCount = group.length;
    const leverageScore = violationCount / Math.max(0.5, effectiveEffort.hours);

    const predictedScoreGain = violationCount * (SCORE_IMPACT[ruleId] ?? 0.4);

    clusters.push({
      id: `cluster_${ruleId}_${clusters.length}`,
      ruleId,
      ruleName: group[0].help || ruleId,
      impact: group[0].impact,
      rootCause: generateRootCause(ruleId, sharedPattern, violationCount),
      sharedPattern,
      violationCount,
      affectedPages: 1, // Single scan = single page
      affectedElements: Math.max(totalElements, violationCount),
      leverageScore,
      estimatedEffort: effectiveEffort,
      predictedScoreGain,
      fixStrategy: generateFixStrategy(ruleId, sharedPattern, group[0].wcagCriteria),
      violations: group.map((v) => ({
        id: v.id,
        url: scanUrl,
        selector: sharedPattern || "unknown",
        impact: v.impact,
      })),
    });
  }

  return clusters;
}

function findSharedPattern(selectors: string[]): string {
  if (selectors.length === 0) return "";
  if (selectors.length === 1) return selectors[0];

  // Find common CSS class
  const classMatches = selectors
    .map((s) => s.match(/\.([\w-]+)/g) ?? [])
    .filter((classes) => classes.length > 0);

  if (classMatches.length < 2) return selectors[0] || "";

  // Find class that appears in most selectors
  const classFreq = new Map<string, number>();
  for (const classes of classMatches) {
    for (const cls of classes) {
      classFreq.set(cls, (classFreq.get(cls) ?? 0) + 1);
    }
  }

  let bestClass = "";
  let bestCount = 0;
  for (const [cls, count] of classFreq) {
    if (count > bestCount && !cls.includes("__") && !cls.includes("--")) {
      bestClass = cls;
      bestCount = count;
    }
  }

  return bestClass || selectors[0] || "";
}

function generateRootCause(ruleId: string, pattern: string, count: number): string {
  const causes: Record<string, string> = {
    "image-alt": `${count} images missing alt text${pattern ? ` (likely from ${pattern} component)` : ""}`,
    "color-contrast": `${count} elements with insufficient contrast ratio${pattern ? ` — shared style: ${pattern}` : ""}`,
    "label": `${count} form inputs without associated labels${pattern ? ` — pattern: ${pattern}` : ""}`,
    "link-name": `${count} links without discernible text${pattern ? ` — pattern: ${pattern}` : ""}`,
    "heading-order": "Heading hierarchy skips levels (e.g. h1 → h3)",
    "landmark-one-main": "Page missing main landmark element",
    "region": `${count} content sections outside landmark regions`,
    "button-name": `${count} buttons without accessible names`,
  };

  return causes[ruleId] ?? `${count} violations of ${ruleId}${pattern ? ` in ${pattern}` : ""}`;
}

function generateFixStrategy(
  ruleId: string,
  pattern: string,
  wcagCriteria: string | null
): FixStrategy {
  const strategies: Record<string, FixStrategy> = {
    "image-alt": {
      type: pattern.includes(".") ? "component" : "content-update",
      description: "Add descriptive alt text to each image, or alt=\"\" for decorative images",
      codeHint: '<img src="..." alt="Description of the image content" />',
      wcagCriteria: ["1.1.1"],
    },
    "color-contrast": {
      type: "global-css",
      description: "Update text/background color pairs to meet 4.5:1 ratio (AA)",
      codeHint: `/* Increase contrast */\n${pattern || ".element"} { color: #1a1a1a; /* or darken background */ }`,
      wcagCriteria: ["1.4.3"],
    },
    "label": {
      type: pattern.includes(".") ? "component" : "single-file",
      description: "Associate labels with form inputs using for/id or wrapping",
      codeHint: '<label for="input-id">Field name</label>\n<input id="input-id" />',
      wcagCriteria: ["1.3.1", "4.1.2"],
    },
    "link-name": {
      type: "single-file",
      description: "Ensure all links have visible text or aria-label",
      codeHint: '<a href="...">Descriptive link text</a>\n<!-- or -->\n<a href="..." aria-label="Description"><Icon /></a>',
      wcagCriteria: ["2.4.4"],
    },
    "heading-order": {
      type: "single-file",
      description: "Fix heading hierarchy to be sequential (h1 → h2 → h3)",
      codeHint: "<!-- Ensure no level is skipped -->\n<h1>Page Title</h1>\n  <h2>Section</h2>\n    <h3>Subsection</h3>",
      wcagCriteria: ["1.3.1"],
    },
    "region": {
      type: "single-file",
      description: "Wrap page content in appropriate landmark elements",
      codeHint: "<header>...</header>\n<nav>...</nav>\n<main>...</main>\n<footer>...</footer>",
      wcagCriteria: ["1.3.1"],
    },
  };

  return strategies[ruleId] ?? {
    type: "single-file",
    description: `Fix ${ruleId} violations`,
    codeHint: `/* Fix: ${ruleId} */`,
    wcagCriteria: wcagCriteria ? [wcagCriteria] : [],
  };
}

function generateBatches(clusters: ViolationCluster[], currentScore: number): RemediationBatch[] {
  const batches: RemediationBatch[] = [];
  let remaining = [...clusters];
  let runningScore = currentScore;
  let batchIndex = 0;

  while (remaining.length > 0) {
    batchIndex++;
    const batch: ViolationCluster[] = [];
    let batchHours = 0;
    const maxBatchHours = 8; // One sprint day

    // Fill batch up to 8 hours
    const nextRemaining: ViolationCluster[] = [];
    for (const cluster of remaining) {
      if (batchHours + cluster.estimatedEffort.hours <= maxBatchHours) {
        batch.push(cluster);
        batchHours += cluster.estimatedEffort.hours;
      } else {
        nextRemaining.push(cluster);
      }
    }

    // If nothing fit in batch, force at least one
    if (batch.length === 0 && nextRemaining.length > 0) {
      batch.push(nextRemaining.shift()!);
      batchHours = batch[0].estimatedEffort.hours;
    }

    const totalResolved = batch.reduce((sum, c) => sum + c.violationCount, 0);
    const scoreGain = batch.reduce((sum, c) => sum + c.predictedScoreGain, 0);
    runningScore = Math.min(100, runningScore + scoreGain);

    // Name the batch based on primary fix category
    const primaryCategory = batch[0]?.fixStrategy.type ?? "general";
    const batchNames: Record<string, string> = {
      "global-css": `Sprint ${batchIndex}: Design System Fixes`,
      "component": `Sprint ${batchIndex}: Component Updates`,
      "content-update": `Sprint ${batchIndex}: Content Remediation`,
      "single-file": `Sprint ${batchIndex}: Page-Level Fixes`,
      "design-system": `Sprint ${batchIndex}: Design Token Updates`,
    };

    batches.push({
      order: batchIndex,
      name: batchNames[primaryCategory] ?? `Sprint ${batchIndex}: Mixed Fixes`,
      clusters: batch,
      totalViolationsResolved: totalResolved,
      estimatedHours: Math.round(batchHours * 10) / 10,
      projectedScoreAfter: Math.round(runningScore * 10) / 10,
      cumulativeImprovement: Math.round((runningScore - currentScore) * 10) / 10,
    });

    remaining = nextRemaining;
  }

  return batches;
}
