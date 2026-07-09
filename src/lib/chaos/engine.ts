/**
 * RegLayer — Accessibility Chaos Engine
 *
 * WHY: Teams configure monitors but never know if they'd actually catch a regression.
 *      Like Netflix's Chaos Monkey, but for accessibility — simulates regressions to
 *      test your detection capabilities without touching your production site.
 *
 * WHAT: Defines a catalog of accessibility "chaos scenarios" (regressions that commonly
 *       happen in real codebases), then evaluates which of your monitors/alerts would
 *       detect each scenario. Produces a Detection Score and coverage gap report.
 *
 * HOW: Pure computation — no actual injection. Simulates what scan results would look
 *      like if each regression happened, then checks your monitors against those results.
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChaosScenario {
  id: string;
  name: string;
  description: string;
  category: "perceivable" | "operable" | "understandable" | "robust";
  severity: "critical" | "serious" | "moderate";
  commonCause: string;
  /** What the scan results would look like if this regression occurred */
  simulatedImpact: {
    scoreDropRange: [number, number]; // min/max score drop
    newViolations: number;
    newCritical: number;
    affectedCriteria: string[];
    affectedRules: string[];
  };
}

export interface ChaosResult {
  scenario: ChaosScenario;
  detected: boolean;
  detectedBy: string[]; // monitor names that would catch it
  gaps: string[]; // what's missing
  recommendation: string;
}

export interface ChaosReport {
  detectionScore: number; // 0-100
  scenariosRun: number;
  scenariosDetected: number;
  scenariosMissed: number;
  results: ChaosResult[];
  coverageByCategory: Record<string, { total: number; detected: number }>;
  topRecommendations: string[];
}

// ─── Chaos Scenario Catalog ──────────────────────────────────────────────────

export const CHAOS_SCENARIOS: ChaosScenario[] = [
  {
    id: "img-alt-removed",
    name: "Image Alt Text Removed",
    description: "All alt attributes stripped from images during a CMS migration or component refactor.",
    category: "perceivable",
    severity: "critical",
    commonCause: "CMS migration, component library update, lazy developer shortcut",
    simulatedImpact: {
      scoreDropRange: [15, 30],
      newViolations: 12,
      newCritical: 8,
      affectedCriteria: ["1.1.1"],
      affectedRules: ["image-alt", "input-image-alt", "svg-img-alt"],
    },
  },
  {
    id: "contrast-regression",
    name: "Color Contrast Failure",
    description: "Brand redesign introduces new colors that fail WCAG contrast ratios.",
    category: "perceivable",
    severity: "serious",
    commonCause: "Design system update, theme change, marketing rebrand",
    simulatedImpact: {
      scoreDropRange: [10, 25],
      newViolations: 20,
      newCritical: 0,
      affectedCriteria: ["1.4.3", "1.4.11"],
      affectedRules: ["color-contrast"],
    },
  },
  {
    id: "focus-order-broken",
    name: "Focus Order Destroyed",
    description: "Tab order becomes illogical after DOM restructuring or z-index changes.",
    category: "operable",
    severity: "critical",
    commonCause: "Layout refactor, modal/overlay additions, CSS grid reordering",
    simulatedImpact: {
      scoreDropRange: [10, 20],
      newViolations: 5,
      newCritical: 3,
      affectedCriteria: ["2.4.3", "2.4.7"],
      affectedRules: ["tabindex", "focus-order-semantics"],
    },
  },
  {
    id: "aria-labels-stripped",
    name: "ARIA Labels Removed",
    description: "aria-label and aria-labelledby attributes removed during HTML cleanup.",
    category: "robust",
    severity: "critical",
    commonCause: "Linter misconfiguration, template engine stripping unknown attributes",
    simulatedImpact: {
      scoreDropRange: [20, 35],
      newViolations: 15,
      newCritical: 10,
      affectedCriteria: ["4.1.2", "1.3.1"],
      affectedRules: ["button-name", "link-name", "aria-required-attr", "label"],
    },
  },
  {
    id: "heading-hierarchy-broken",
    name: "Heading Hierarchy Collapsed",
    description: "All headings changed to same level (e.g., all h2) breaking document structure.",
    category: "perceivable",
    severity: "moderate",
    commonCause: "Component refactor, CMS template change, style-first development",
    simulatedImpact: {
      scoreDropRange: [5, 12],
      newViolations: 4,
      newCritical: 0,
      affectedCriteria: ["1.3.1", "2.4.6"],
      affectedRules: ["heading-order", "empty-heading", "page-has-heading-one"],
    },
  },
  {
    id: "keyboard-trap-introduced",
    name: "Keyboard Trap Introduced",
    description: "A modal or custom widget traps keyboard focus with no escape mechanism.",
    category: "operable",
    severity: "critical",
    commonCause: "Custom modal without escape handler, third-party widget integration",
    simulatedImpact: {
      scoreDropRange: [15, 25],
      newViolations: 2,
      newCritical: 2,
      affectedCriteria: ["2.1.2"],
      affectedRules: ["scrollable-region-focusable"],
    },
  },
  {
    id: "form-labels-missing",
    name: "Form Labels Disconnected",
    description: "Form inputs lose their label associations after form builder update.",
    category: "understandable",
    severity: "serious",
    commonCause: "Form library upgrade, dynamic form generation, ID conflicts",
    simulatedImpact: {
      scoreDropRange: [8, 18],
      newViolations: 8,
      newCritical: 0,
      affectedCriteria: ["1.3.1", "3.3.2", "4.1.2"],
      affectedRules: ["label", "select-name", "form-field-multiple-labels"],
    },
  },
  {
    id: "lang-attribute-removed",
    name: "Language Declaration Removed",
    description: "The html lang attribute is removed or set to empty string.",
    category: "understandable",
    severity: "serious",
    commonCause: "Template refactor, SSR framework misconfiguration",
    simulatedImpact: {
      scoreDropRange: [3, 8],
      newViolations: 1,
      newCritical: 0,
      affectedCriteria: ["3.1.1"],
      affectedRules: ["html-has-lang", "html-lang-valid"],
    },
  },
  {
    id: "landmark-regions-removed",
    name: "Landmark Regions Removed",
    description: "Semantic HTML landmarks replaced with generic divs during redesign.",
    category: "operable",
    severity: "moderate",
    commonCause: "CSS-first redesign, div-soup refactor, template simplification",
    simulatedImpact: {
      scoreDropRange: [5, 10],
      newViolations: 3,
      newCritical: 0,
      affectedCriteria: ["2.4.1"],
      affectedRules: ["region", "landmark-one-main", "bypass"],
    },
  },
  {
    id: "duplicate-ids-introduced",
    name: "Duplicate IDs Across Components",
    description: "Server-rendered component instances produce conflicting IDs.",
    category: "robust",
    severity: "serious",
    commonCause: "SSR hydration, component reuse without unique IDs, copy-paste",
    simulatedImpact: {
      scoreDropRange: [5, 12],
      newViolations: 6,
      newCritical: 0,
      affectedCriteria: ["4.1.1"],
      affectedRules: ["duplicate-id", "duplicate-id-active", "duplicate-id-aria"],
    },
  },
  {
    id: "viewport-zoom-disabled",
    name: "Viewport Zoom Disabled",
    description: "Meta viewport tag set with maximum-scale=1 or user-scalable=no.",
    category: "perceivable",
    severity: "serious",
    commonCause: "Mobile-first developer preventing zoom, PWA configuration",
    simulatedImpact: {
      scoreDropRange: [5, 10],
      newViolations: 1,
      newCritical: 0,
      affectedCriteria: ["1.4.4"],
      affectedRules: ["meta-viewport"],
    },
  },
  {
    id: "auto-refresh-added",
    name: "Auto-Refresh Without Warning",
    description: "Page meta refresh added for content updates without user control.",
    category: "operable",
    severity: "serious",
    commonCause: "Real-time dashboard feature, polling implementation",
    simulatedImpact: {
      scoreDropRange: [5, 8],
      newViolations: 1,
      newCritical: 0,
      affectedCriteria: ["2.2.1"],
      affectedRules: ["meta-refresh"],
    },
  },
];

// ─── Chaos Engine ────────────────────────────────────────────────────────────

/**
 * Run the chaos simulation for a workspace.
 *
 * For each chaos scenario, simulates what scan results would look like,
 * then checks which monitors would trigger.
 */
export async function runChaosSimulation(workspaceId: string): Promise<ChaosReport> {
  // Get workspace's monitors
  const monitors = await prisma.monitor.findMany({
    where: { workspaceId, enabled: true },
  });

  // Get the workspace's current average score (baseline)
  const recentScans = await prisma.scan.findMany({
    where: { workspaceId, status: "COMPLETED", score: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { score: true, url: true },
  });

  const baselineScore =
    recentScans.length > 0
      ? recentScans.reduce((sum, s) => sum + (s.score || 0), 0) / recentScans.length
      : 85; // default assumption if no scans

  // Get monitored URLs
  const monitoredUrls = new Set(monitors.map((m) => m.url));

  // Run each scenario
  const results: ChaosResult[] = CHAOS_SCENARIOS.map((scenario) => {
    return evaluateScenario(scenario, monitors, baselineScore, monitoredUrls);
  });

  // Compute coverage by category
  const coverageByCategory: Record<string, { total: number; detected: number }> = {};
  for (const r of results) {
    const cat = r.scenario.category;
    if (!coverageByCategory[cat]) coverageByCategory[cat] = { total: 0, detected: 0 };
    coverageByCategory[cat].total++;
    if (r.detected) coverageByCategory[cat].detected++;
  }

  // Detection score
  const detected = results.filter((r) => r.detected).length;
  const detectionScore = Math.round((detected / results.length) * 100);

  // Top recommendations (from missed scenarios, prioritized by severity)
  const missed = results
    .filter((r) => !r.detected)
    .sort((a, b) => {
      const sevOrder = { critical: 0, serious: 1, moderate: 2 };
      return sevOrder[a.scenario.severity] - sevOrder[b.scenario.severity];
    });

  const topRecommendations = missed.slice(0, 5).map((r) => r.recommendation);

  return {
    detectionScore,
    scenariosRun: results.length,
    scenariosDetected: detected,
    scenariosMissed: results.length - detected,
    results,
    coverageByCategory,
    topRecommendations,
  };
}

// ─── Internal ────────────────────────────────────────────────────────────────

interface MonitorRecord {
  id: string;
  name: string;
  url: string;
  condition: string;
  threshold: number;
  enabled: boolean;
}

function evaluateScenario(
  scenario: ChaosScenario,
  monitors: MonitorRecord[],
  baselineScore: number,
  monitoredUrls: Set<string>
): ChaosResult {
  const detectedBy: string[] = [];
  const gaps: string[] = [];

  // Simulate the score after this regression
  const avgDrop = (scenario.simulatedImpact.scoreDropRange[0] + scenario.simulatedImpact.scoreDropRange[1]) / 2;
  const simulatedScore = Math.max(0, baselineScore - avgDrop);

  // Check each monitor against the simulated results
  for (const monitor of monitors) {
    switch (monitor.condition) {
      case "score_below":
        if (simulatedScore < monitor.threshold) {
          detectedBy.push(monitor.name);
        }
        break;
      case "score_drop":
        if (avgDrop >= monitor.threshold) {
          detectedBy.push(monitor.name);
        }
        break;
      case "new_critical":
        if (scenario.simulatedImpact.newCritical >= monitor.threshold) {
          detectedBy.push(monitor.name);
        }
        break;
      case "new_violations":
        if (scenario.simulatedImpact.newViolations >= monitor.threshold) {
          detectedBy.push(monitor.name);
        }
        break;
    }
  }

  // Identify gaps
  if (monitors.length === 0) {
    gaps.push("No monitors configured at all");
  } else {
    if (monitoredUrls.size === 0) {
      gaps.push("No URLs are being monitored");
    }

    const hasScoreMonitor = monitors.some((m) => m.condition === "score_below" || m.condition === "score_drop");
    const hasCriticalMonitor = monitors.some((m) => m.condition === "new_critical");
    const hasViolationMonitor = monitors.some((m) => m.condition === "new_violations");

    if (!hasScoreMonitor && scenario.simulatedImpact.scoreDropRange[0] >= 10) {
      gaps.push("No score-based monitor would catch this score drop");
    }
    if (!hasCriticalMonitor && scenario.simulatedImpact.newCritical > 0) {
      gaps.push("No critical-issue monitor configured");
    }
    if (!hasViolationMonitor && scenario.simulatedImpact.newViolations >= 5) {
      gaps.push("No violation-count monitor to catch bulk regressions");
    }
  }

  // Generate recommendation
  let recommendation: string;
  if (detectedBy.length > 0) {
    recommendation = `✓ Your monitors would catch this. ${detectedBy.length} monitor(s) would trigger.`;
  } else if (monitors.length === 0) {
    recommendation = `Add a monitor with condition "score_below" threshold ${Math.round(baselineScore - 5)} to catch this ${scenario.severity} regression.`;
  } else {
    // Suggest the most appropriate monitor type
    if (scenario.simulatedImpact.newCritical > 0) {
      recommendation = `Add a "new_critical" monitor with threshold 1 to catch ${scenario.name.toLowerCase()}.`;
    } else if (avgDrop >= 10) {
      recommendation = `Add a "score_drop" monitor with threshold ${Math.round(avgDrop * 0.7)} to detect this regression.`;
    } else {
      recommendation = `Add a "new_violations" monitor with threshold ${Math.max(1, scenario.simulatedImpact.newViolations - 2)} for ${scenario.category} issues.`;
    }
  }

  return {
    scenario,
    detected: detectedBy.length > 0,
    detectedBy,
    gaps,
    recommendation,
  };
}
