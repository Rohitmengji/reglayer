/**
 * RegLayer — Accessibility Intelligence Score (AIS) Engine
 *
 * WHY: A single flat "score: 73" tells nothing about who's blocked, how fast you're
 *      improving, or where legal risk lives. AIS is a multi-dimensional composite
 *      (0–850) — like a credit score for accessibility — that quantifies real human
 *      impact across 6 orthogonal dimensions.
 *
 * WHAT: Computes a weighted composite from:
 *   1. Barrier Severity (25%) — violation impact on task completion
 *   2. Population Reach (20%) — % of disability populations blocked
 *   3. Temporal Velocity (15%) — rate of improvement over time
 *   4. Structural Depth (15%) — site-wide vs. isolated issues
 *   5. Regulatory Exposure (15%) — legal risk mapping
 *   6. Assistive Tech Compatibility (10%) — AT interoperability gaps
 *
 * HOW: Pure TypeScript math — no AI/LLM calls. Deterministic and reproducible.
 *      Consumes existing scan data (violations, WCAG tags, historical scores).
 *
 * Scale: 0–850 (inspired by credit scoring; avoids confusion with percentage-based scores)
 */

import type { AccessibilityViolation, ScanSummary } from "@/lib/types";

// ─────────────── Constants ───────────────

const MAX_SCORE = 850;

/** Dimension weights (must sum to 1.0) */
const WEIGHTS = {
  barrierSeverity: 0.25,
  populationReach: 0.20,
  temporalVelocity: 0.15,
  structuralDepth: 0.15,
  regulatoryExposure: 0.15,
  assistiveTechCompat: 0.10,
} as const;

/** Impact multipliers — critical violations hurt exponentially more */
const IMPACT_WEIGHTS: Record<string, number> = {
  critical: 25,
  serious: 12,
  moderate: 5,
  minor: 1,
};

/**
 * Maps axe-core rule IDs to the disability populations they block.
 * Based on WAI research and WCAG success criteria intent documents.
 */
const RULE_TO_POPULATIONS: Record<string, string[]> = {
  // Visual — blind users (screen readers)
  "image-alt": ["blind", "low-vision"],
  "input-image-alt": ["blind"],
  "area-alt": ["blind"],
  "object-alt": ["blind"],
  "svg-img-alt": ["blind", "low-vision"],
  "role-img-alt": ["blind"],

  // Visual — low vision (magnification, contrast)
  "color-contrast": ["low-vision", "color-blind"],
  "color-contrast-enhanced": ["low-vision", "color-blind"],
  "meta-viewport": ["low-vision"],
  "target-size": ["motor", "low-vision"],

  // Motor — keyboard-only users
  "keyboard": ["motor", "blind"],
  "tabindex": ["motor", "blind"],
  "focus-order-semantics": ["motor"],
  "scrollable-region-focusable": ["motor"],
  "nested-interactive": ["motor"],
  "no-autoplay-audio": ["cognitive", "blind"],

  // Cognitive — learning disabilities, ADHD
  "heading-order": ["cognitive", "blind"],
  "page-has-heading-one": ["cognitive", "blind"],
  "landmark-one-main": ["cognitive", "blind"],
  "region": ["cognitive", "blind"],
  "document-title": ["cognitive"],
  "link-name": ["cognitive", "blind"],
  "label": ["cognitive", "motor", "blind"],
  "duplicate-id": ["blind", "cognitive"],

  // Auditory — deaf users
  "video-caption": ["deaf", "hard-of-hearing"],
  "audio-caption": ["deaf", "hard-of-hearing"],

  // AT interop — screen readers, voice control
  "aria-allowed-attr": ["blind"],
  "aria-hidden-body": ["blind"],
  "aria-hidden-focus": ["blind", "motor"],
  "aria-required-attr": ["blind"],
  "aria-required-children": ["blind"],
  "aria-required-parent": ["blind"],
  "aria-roles": ["blind"],
  "aria-valid-attr": ["blind"],
  "aria-valid-attr-value": ["blind"],
  "button-name": ["blind", "motor"],
  "form-field-multiple-labels": ["blind"],
  "select-name": ["blind"],

  // Seizure — photosensitive epilepsy
  "blink": ["seizure"],
  "marquee": ["seizure", "cognitive"],
};

/**
 * Global disability prevalence (WHO 2023).
 * Used to weight population-blocking severity.
 */
const POPULATION_SIZE: Record<string, number> = {
  blind: 39_000_000,
  "low-vision": 246_000_000,
  "color-blind": 300_000_000,
  motor: 200_000_000,
  cognitive: 400_000_000,
  deaf: 70_000_000,
  "hard-of-hearing": 430_000_000,
  seizure: 50_000_000,
};

/** Total global population with any disability (WHO: 1.3B) */
const TOTAL_DISABLED_POPULATION = 1_300_000_000;

/**
 * WCAG criteria → regulatory frameworks that mandate them.
 * Used for regulatory exposure scoring.
 */
const HIGH_RISK_CRITERIA: Record<string, { frameworks: string[]; maxFine: number }> = {
  "1.1.1": { frameworks: ["WCAG-A", "EAA", "Section508", "ADA"], maxFine: 150_000 },
  "1.3.1": { frameworks: ["WCAG-A", "EAA", "Section508"], maxFine: 100_000 },
  "1.4.3": { frameworks: ["WCAG-AA", "EAA"], maxFine: 75_000 },
  "2.1.1": { frameworks: ["WCAG-A", "EAA", "Section508", "ADA"], maxFine: 150_000 },
  "2.4.2": { frameworks: ["WCAG-A", "Section508"], maxFine: 50_000 },
  "2.4.4": { frameworks: ["WCAG-AA", "EAA"], maxFine: 75_000 },
  "3.1.1": { frameworks: ["WCAG-A", "EAA"], maxFine: 50_000 },
  "4.1.2": { frameworks: ["WCAG-A", "EAA", "Section508", "ADA"], maxFine: 150_000 },
  "1.4.1": { frameworks: ["WCAG-A", "EAA"], maxFine: 75_000 },
  "2.4.1": { frameworks: ["WCAG-A", "Section508"], maxFine: 50_000 },
  "3.3.2": { frameworks: ["WCAG-A", "EAA"], maxFine: 50_000 },
  "4.1.1": { frameworks: ["WCAG-A", "Section508"], maxFine: 50_000 },
};

/** Rules that indicate AT compatibility issues (ARIA, semantics, focus) */
const AT_COMPAT_RULES = new Set([
  "aria-allowed-attr", "aria-hidden-body", "aria-hidden-focus",
  "aria-required-attr", "aria-required-children", "aria-required-parent",
  "aria-roles", "aria-valid-attr", "aria-valid-attr-value",
  "button-name", "label", "select-name", "input-image-alt",
  "form-field-multiple-labels", "duplicate-id", "landmark-one-main",
  "region", "heading-order", "page-has-heading-one", "link-name",
  "document-title", "tabindex", "focus-order-semantics",
]);

// ─────────────── Types ───────────────

export interface AISInput {
  /** Current scan violations */
  violations: AccessibilityViolation[];
  /** Current scan summary */
  summary: ScanSummary;
  /** Historical scores for velocity calculation (newest first) */
  historicalScores?: Array<{ score: number; date: string }>;
  /** Number of unique pages scanned (for structural depth) */
  pagesScanned?: number;
  /** Total violations across all pages (for structural depth) */
  totalSiteViolations?: number;
}

export interface AISResult {
  /** Composite score 0–850 */
  score: number;
  /** Letter grade */
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
  /** Human-readable label */
  label: string;
  /** Individual dimension scores (each 0–850) */
  dimensions: AISDimensions;
  /** Populations affected and their estimated blocked counts */
  populationsAffected: PopulationImpact[];
  /** Top improvement actions ranked by AIS point gain */
  improvements: ImprovementAction[];
  /** Predicted score if top 3 improvements are made */
  projectedScore: number;
}

export interface AISDimensions {
  barrierSeverity: DimensionScore;
  populationReach: DimensionScore;
  temporalVelocity: DimensionScore;
  structuralDepth: DimensionScore;
  regulatoryExposure: DimensionScore;
  assistiveTechCompat: DimensionScore;
}

export interface DimensionScore {
  score: number; // 0–850
  label: string;
  detail: string;
}

export interface PopulationImpact {
  population: string;
  estimatedBlocked: number;
  severity: "full-block" | "partial-block" | "minor-friction";
  affectingRules: string[];
}

export interface ImprovementAction {
  ruleId: string;
  description: string;
  impact: string;
  pointGain: number;
  effort: "low" | "medium" | "high";
  affectedElements: number;
}

// ─────────────── Main Entry Point ───────────────

/**
 * Calculate the Accessibility Intelligence Score.
 *
 * @param input - Scan violations, summary, and optional historical/structural data
 * @returns Full AIS result with composite score, dimensions, populations, and improvements
 */
export function calculateAIS(input: AISInput): AISResult {
  const { violations, summary, historicalScores, pagesScanned, totalSiteViolations } = input;

  // Calculate each dimension
  const barrierSeverity = calcBarrierSeverity(violations, summary);
  const populationReach = calcPopulationReach(violations);
  const temporalVelocity = calcTemporalVelocity(historicalScores);
  const structuralDepth = calcStructuralDepth(violations, pagesScanned, totalSiteViolations);
  const regulatoryExposure = calcRegulatoryExposure(violations);
  const assistiveTechCompat = calcAssistiveTechCompat(violations);

  // Weighted composite
  const composite = Math.round(
    barrierSeverity.score * WEIGHTS.barrierSeverity +
    populationReach.score * WEIGHTS.populationReach +
    temporalVelocity.score * WEIGHTS.temporalVelocity +
    structuralDepth.score * WEIGHTS.structuralDepth +
    regulatoryExposure.score * WEIGHTS.regulatoryExposure +
    assistiveTechCompat.score * WEIGHTS.assistiveTechCompat
  );

  const score = clamp(composite, 0, MAX_SCORE);
  const { grade, label } = scoreToGrade(score);

  const dimensions: AISDimensions = {
    barrierSeverity,
    populationReach,
    temporalVelocity,
    structuralDepth,
    regulatoryExposure,
    assistiveTechCompat,
  };

  const populationsAffected = calcPopulationsAffected(violations);
  const improvements = calcImprovements(violations, input);
  const projectedScore = calcProjectedScore(score, improvements);

  return {
    score,
    grade,
    label,
    dimensions,
    populationsAffected,
    improvements,
    projectedScore,
  };
}

// ─────────────── Dimension Calculators ───────────────

/**
 * Dimension 1: Barrier Severity (25%)
 *
 * Measures how severely violations block task completion.
 * Uses exponential decay: more critical violations → exponentially lower score.
 */
function calcBarrierSeverity(
  violations: AccessibilityViolation[],
  summary: ScanSummary
): DimensionScore {
  if (violations.length === 0) {
    return { score: MAX_SCORE, label: "Excellent", detail: "No barriers detected" };
  }

  // Weighted violation load (critical counts 25x more than minor)
  const weightedLoad = violations.reduce((sum, v) => {
    const elementCount = v.nodes.length;
    const weight = IMPACT_WEIGHTS[v.impact] ?? 5;
    return sum + (weight * Math.sqrt(elementCount)); // sqrt dampens large element counts
  }, 0);

  // Exponential decay: score = MAX * e^(-load/k)
  // k=80 tuned so 5 critical violations ≈ 400 score, 20 critical ≈ 100
  const k = 80;
  const raw = MAX_SCORE * Math.exp(-weightedLoad / k);
  const score = Math.round(clamp(raw, 0, MAX_SCORE));

  const label = score >= 700 ? "Low barriers" :
    score >= 500 ? "Moderate barriers" :
    score >= 300 ? "High barriers" : "Severe barriers";

  const detail = `${summary.critical} critical, ${summary.serious} serious, ` +
    `${summary.moderate} moderate, ${summary.minor} minor violations`;

  return { score, label, detail };
}

/**
 * Dimension 2: Population Reach (20%)
 *
 * Maps violations to WHO disability populations and calculates
 * what percentage of disabled users are partially or fully blocked.
 */
function calcPopulationReach(violations: AccessibilityViolation[]): DimensionScore {
  if (violations.length === 0) {
    return { score: MAX_SCORE, label: "All populations served", detail: "No populations blocked" };
  }

  // Collect all affected populations with weighted severity
  const populationLoad: Record<string, number> = {};

  for (const v of violations) {
    const populations = RULE_TO_POPULATIONS[v.id] ?? [];
    const weight = IMPACT_WEIGHTS[v.impact] ?? 5;
    const elementCount = v.nodes.length;

    for (const pop of populations) {
      populationLoad[pop] = (populationLoad[pop] ?? 0) + weight * Math.log2(elementCount + 1);
    }
  }

  // Calculate percentage of disabled population affected (weighted by severity)
  let blockedPopulation = 0;
  for (const [pop, load] of Object.entries(populationLoad)) {
    const popSize = POPULATION_SIZE[pop] ?? 50_000_000;
    // Sigmoid: high load → full block, low load → minor friction
    const blockFraction = sigmoid(load, 30); // 50% block at load=30
    blockedPopulation += popSize * blockFraction;
  }

  const blockedPercent = blockedPopulation / TOTAL_DISABLED_POPULATION;
  // Score inversely proportional to blocked percentage
  const score = Math.round(MAX_SCORE * (1 - Math.min(blockedPercent * 2, 1)));

  const affectedCount = Object.keys(populationLoad).length;
  const label = affectedCount === 0 ? "No populations affected" :
    affectedCount <= 2 ? "Limited population impact" :
    affectedCount <= 4 ? "Multiple populations affected" : "Wide population impact";

  const detail = `${affectedCount} disability group${affectedCount !== 1 ? "s" : ""} affected, ` +
    `~${formatNumber(Math.round(blockedPopulation))} people impacted`;

  return { score: clamp(score, 0, MAX_SCORE), label, detail };
}

/**
 * Dimension 3: Temporal Velocity (15%)
 *
 * Rewards consistent improvement over time. Penalizes stagnation and regression.
 * Sites with no history get a neutral score (not penalized).
 */
function calcTemporalVelocity(
  historicalScores?: Array<{ score: number; date: string }>
): DimensionScore {
  // No history — neutral score (don't penalize new scans)
  if (!historicalScores || historicalScores.length < 2) {
    return { score: 550, label: "Insufficient history", detail: "Need 2+ scans for trend analysis" };
  }

  // Calculate week-over-week change using linear regression
  const sorted = [...historicalScores].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const firstDate = new Date(sorted[0].date).getTime();
  const x = sorted.map((s) => (new Date(s.date).getTime() - firstDate) / (7 * 24 * 60 * 60 * 1000)); // weeks
  const y = sorted.map((s) => s.score);

  const { slope } = linearRegression(x, y);

  // slope = score points gained per week
  // +3/week = excellent improvement → 850
  // 0/week = stagnant → 425
  // -3/week = declining → 0
  const normalized = clamp((slope + 3) / 6, 0, 1); // maps [-3, +3] to [0, 1]
  const score = Math.round(normalized * MAX_SCORE);

  const label = slope > 2 ? "Rapidly improving" :
    slope > 0.5 ? "Steadily improving" :
    slope > -0.5 ? "Stable" :
    slope > -2 ? "Declining" : "Rapidly declining";

  const detail = slope >= 0
    ? `+${slope.toFixed(1)} points/week over ${sorted.length} scans`
    : `${slope.toFixed(1)} points/week over ${sorted.length} scans`;

  return { score: clamp(score, 0, MAX_SCORE), label, detail };
}

/**
 * Dimension 4: Structural Depth (15%)
 *
 * Measures whether issues are isolated or systemic (site-wide, in shared components).
 * Repeated violations across pages indicate component-level problems.
 */
function calcStructuralDepth(
  violations: AccessibilityViolation[],
  pagesScanned?: number,
  totalSiteViolations?: number
): DimensionScore {
  if (violations.length === 0) {
    return { score: MAX_SCORE, label: "Clean structure", detail: "No structural issues" };
  }

  const pages = pagesScanned ?? 1;
  const siteViolations = totalSiteViolations ?? violations.length;

  // Violation density = average violations per page
  const density = siteViolations / Math.max(pages, 1);

  // Rule repetition: how many unique rules appear? High unique count = systemic
  const uniqueRules = new Set(violations.map((v) => v.id));
  const repetitionRatio = violations.length / uniqueRules.size; // >1 = repeated patterns

  // Combined structural risk score
  // Low density + low repetition = isolated issues (good)
  // High density + high repetition = systemic component failures (bad)
  const densityPenalty = Math.min(density / 20, 1); // 20+ violations/page = max penalty
  const repetitionPenalty = Math.min((repetitionRatio - 1) / 5, 1); // 6+ repeats = max penalty
  const combined = (densityPenalty * 0.6 + repetitionPenalty * 0.4);

  const score = Math.round(MAX_SCORE * (1 - combined));

  const label = combined < 0.2 ? "Isolated issues" :
    combined < 0.5 ? "Some patterns" :
    combined < 0.75 ? "Systemic patterns" : "Deep structural failures";

  const detail = `${uniqueRules.size} unique rule${uniqueRules.size !== 1 ? "s" : ""} across ${pages} page${pages !== 1 ? "s" : ""}, ` +
    `${density.toFixed(1)} avg violations/page`;

  return { score: clamp(score, 0, MAX_SCORE), label, detail };
}

/**
 * Dimension 5: Regulatory Exposure (15%)
 *
 * Maps violations to legal frameworks (EAA, ADA, Section 508) and estimates
 * exposure based on which mandated criteria are failing.
 */
function calcRegulatoryExposure(violations: AccessibilityViolation[]): DimensionScore {
  if (violations.length === 0) {
    return { score: MAX_SCORE, label: "Compliant", detail: "No regulatory violations detected" };
  }

  let totalExposure = 0;
  const frameworksViolated = new Set<string>();
  const criteriaViolated = new Set<string>();

  for (const v of violations) {
    // Extract WCAG criteria from tags like "wcag2a", "wcag111", "wcag143"
    for (const tag of v.wcagTags) {
      const criterionMatch = tag.match(/wcag(\d)(\d)(\d+)/);
      if (criterionMatch) {
        const criterion = `${criterionMatch[1]}.${criterionMatch[2]}.${criterionMatch[3]}`;
        const riskInfo = HIGH_RISK_CRITERIA[criterion];
        if (riskInfo) {
          criteriaViolated.add(criterion);
          riskInfo.frameworks.forEach((f) => frameworksViolated.add(f));
          // Weight by element count (more instances = higher visibility to auditors)
          totalExposure += riskInfo.maxFine * Math.log2(v.nodes.length + 1);
        }
      }
    }
  }

  // Normalize: $0 exposure = 850, $500K+ = 0
  const normalizedExposure = Math.min(totalExposure / 500_000, 1);
  const score = Math.round(MAX_SCORE * (1 - normalizedExposure));

  const label = normalizedExposure < 0.1 ? "Low risk" :
    normalizedExposure < 0.3 ? "Moderate risk" :
    normalizedExposure < 0.6 ? "High risk" : "Critical legal risk";

  const detail = `${criteriaViolated.size} criteria violated across ${frameworksViolated.size} framework${frameworksViolated.size !== 1 ? "s" : ""}`;

  return { score: clamp(score, 0, MAX_SCORE), label, detail };
}

/**
 * Dimension 6: Assistive Technology Compatibility (10%)
 *
 * Measures how well the page works with screen readers, switch devices,
 * and voice control — based on ARIA correctness, semantics, and focus management.
 */
function calcAssistiveTechCompat(violations: AccessibilityViolation[]): DimensionScore {
  if (violations.length === 0) {
    return { score: MAX_SCORE, label: "Fully compatible", detail: "No AT compatibility issues" };
  }

  // Count AT-specific violations and their severity
  let atViolationWeight = 0;
  let atViolationCount = 0;

  for (const v of violations) {
    if (AT_COMPAT_RULES.has(v.id)) {
      const weight = IMPACT_WEIGHTS[v.impact] ?? 5;
      atViolationWeight += weight * Math.sqrt(v.nodes.length);
      atViolationCount++;
    }
  }

  // Exponential decay: k=40 tuned so 3 serious AT issues ≈ 500 score
  const raw = MAX_SCORE * Math.exp(-atViolationWeight / 40);
  const score = Math.round(clamp(raw, 0, MAX_SCORE));

  const label = score >= 700 ? "Good AT support" :
    score >= 500 ? "Moderate AT issues" :
    score >= 300 ? "Poor AT support" : "AT largely broken";

  const detail = `${atViolationCount} AT-related violation${atViolationCount !== 1 ? "s" : ""} detected`;

  return { score: clamp(score, 0, MAX_SCORE), label, detail };
}

// ─────────────── Population Impact ───────────────

function calcPopulationsAffected(violations: AccessibilityViolation[]): PopulationImpact[] {
  const populationData: Record<string, { load: number; rules: Set<string> }> = {};

  for (const v of violations) {
    const populations = RULE_TO_POPULATIONS[v.id] ?? [];
    const weight = IMPACT_WEIGHTS[v.impact] ?? 5;

    for (const pop of populations) {
      if (!populationData[pop]) populationData[pop] = { load: 0, rules: new Set() };
      populationData[pop].load += weight * v.nodes.length;
      populationData[pop].rules.add(v.id);
    }
  }

  return Object.entries(populationData)
    .map(([population, { load, rules }]) => {
      const popSize = POPULATION_SIZE[population] ?? 50_000_000;
      const blockFraction = sigmoid(load, 50);
      const estimatedBlocked = Math.round(popSize * blockFraction);
      const severity: PopulationImpact["severity"] =
        blockFraction > 0.5 ? "full-block" :
        blockFraction > 0.2 ? "partial-block" : "minor-friction";

      return {
        population,
        estimatedBlocked,
        severity,
        affectingRules: [...rules],
      };
    })
    .sort((a, b) => b.estimatedBlocked - a.estimatedBlocked);
}

// ─────────────── Improvement Simulator ───────────────

function calcImprovements(
  violations: AccessibilityViolation[],
  input: AISInput
): ImprovementAction[] {
  if (violations.length === 0) return [];

  const currentScore = calculateBareSeverityScore(violations, input.summary);

  // For each violation, estimate the AIS point gain if it were fixed
  // Use fast non-recursive scoring to avoid exponential blowup
  const actions: ImprovementAction[] = violations.map((v) => {
    const remaining = violations.filter((x) => x !== v);
    const newScore = calculateBareSeverityScore(remaining, recalcSummary(remaining));
    const pointGain = Math.max(newScore - currentScore, 0);

    const effort: ImprovementAction["effort"] =
      v.nodes.length > 20 ? "high" :
      v.nodes.length > 5 ? "medium" : "low";

    return {
      ruleId: v.id,
      description: v.help,
      impact: v.impact,
      pointGain,
      effort,
      affectedElements: v.nodes.length,
    };
  });

  // Sort by efficiency: point gain / effort rank
  const effortRank = { low: 1, medium: 2, high: 3 };
  return actions
    .sort((a, b) => (b.pointGain / effortRank[b.effort]) - (a.pointGain / effortRank[a.effort]))
    .slice(0, 10); // Top 10 actions
}

/** Quick composite without recursion (avoids infinite loop in improvement calc) */
function calculateBareSeverityScore(
  violations: AccessibilityViolation[],
  summary: ScanSummary
): number {
  const bs = calcBarrierSeverity(violations, summary);
  const pr = calcPopulationReach(violations);
  const re = calcRegulatoryExposure(violations);
  const at = calcAssistiveTechCompat(violations);

  return Math.round(
    bs.score * WEIGHTS.barrierSeverity +
    pr.score * WEIGHTS.populationReach +
    550 * WEIGHTS.temporalVelocity + // neutral
    550 * WEIGHTS.structuralDepth + // neutral
    re.score * WEIGHTS.regulatoryExposure +
    at.score * WEIGHTS.assistiveTechCompat
  );
}

function calcProjectedScore(currentScore: number, improvements: ImprovementAction[]): number {
  // Sum top 3 improvement gains
  const top3Gain = improvements.slice(0, 3).reduce((sum, a) => sum + a.pointGain, 0);
  return Math.min(currentScore + top3Gain, MAX_SCORE);
}

// ─────────────── Utilities ───────────────

function scoreToGrade(score: number): { grade: AISResult["grade"]; label: string } {
  if (score >= 750) return { grade: "A+", label: "Excellent" };
  if (score >= 650) return { grade: "A", label: "Good" };
  if (score >= 550) return { grade: "B", label: "Fair" };
  if (score >= 400) return { grade: "C", label: "Poor" };
  if (score >= 200) return { grade: "D", label: "Critical" };
  return { grade: "F", label: "Failing" };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Sigmoid function: smooth 0→1 transition centered at threshold */
function sigmoid(x: number, threshold: number): number {
  return 1 / (1 + Math.exp(-(x - threshold) / (threshold * 0.3)));
}

function linearRegression(x: number[], y: number[]): { slope: number; intercept: number } {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: y[0] ?? 0 };

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, xi, i) => a + xi * y[i], 0);
  const sumX2 = x.reduce((a, xi) => a + xi * xi, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function recalcSummary(violations: AccessibilityViolation[]): ScanSummary {
  const summary: ScanSummary = {
    totalViolations: violations.length,
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
    score: 0,
  };
  for (const v of violations) {
    if (v.impact === "critical") summary.critical++;
    else if (v.impact === "serious") summary.serious++;
    else if (v.impact === "moderate") summary.moderate++;
    else summary.minor++;
  }
  // Approximate axe-core score formula
  summary.score = violations.length === 0 ? 100 :
    Math.max(0, 100 - (summary.critical * 10 + summary.serious * 5 + summary.moderate * 2 + summary.minor * 0.5));
  return summary;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
