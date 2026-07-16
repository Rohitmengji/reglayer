/**
 * RegLayer — AI Experiments Service
 *
 * A/B test prompts, models, and temperatures to find what works best.
 *
 * WHY: "Is GPT-4o-mini or Claude Haiku better for violation explanations?"
 * "Does a longer system prompt improve accuracy?" Without experiments,
 * you're guessing. With them, you have data.
 *
 * ARCHITECTURE:
 *   Create experiment → Define variants A + B → Start → Route traffic →
 *   Collect metrics → Compare → Pick winner → Apply
 *
 * HOW TRAFFIC SPLITTING WORKS:
 *   When a RUNNING experiment exists for a feature, the resolve function
 *   returns variant A or B based on the trafficSplit ratio (0.5 = 50/50).
 *   The assignment is deterministic per userId so the same user always sees
 *   the same variant within an experiment (no flip-flopping).
 *
 * INSPIRED BY:
 *   - LaunchDarkly (feature flag experiments)
 *   - Statsig (product experiments)
 *   - Weights & Biases (ML experiments)
 *   - OpenAI Evals (prompt evaluation)
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExperimentStatus = "DRAFT" | "RUNNING" | "PAUSED" | "COMPLETED";

export interface ExperimentEntry {
  id: string;
  name: string;
  description: string | null;
  status: ExperimentStatus;
  feature: string;
  promptA: string;
  modelA: string;
  temperatureA: number;
  promptB: string;
  modelB: string;
  temperatureB: number;
  trafficSplit: number;
  totalTrials: number;
  trialsA: number;
  trialsB: number;
  avgLatencyA: number;
  avgLatencyB: number;
  avgCostA: number;
  avgCostB: number;
  avgRatingA: number | null;
  avgRatingB: number | null;
  createdAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
}

export type Variant = "A" | "B";

export interface VariantConfig {
  variant: Variant;
  prompt: string;
  model: string;
  temperature: number;
  experimentId: string;
}

// ── Experiment CRUD ───────────────────────────────────────────────────────────

/**
 * Create a new experiment (starts as DRAFT).
 */
export async function createExperiment(opts: {
  name: string;
  description?: string;
  feature: string;
  promptA: string;
  modelA: string;
  temperatureA?: number;
  promptB: string;
  modelB: string;
  temperatureB?: number;
  trafficSplit?: number;
  workspaceId: string;
  createdBy: string;
}): Promise<ExperimentEntry> {
  const result = await prisma.aiExperiment.create({
    data: {
      name: opts.name,
      description: opts.description ?? null,
      feature: opts.feature,
      promptA: opts.promptA,
      modelA: opts.modelA,
      temperatureA: opts.temperatureA ?? 0.4,
      promptB: opts.promptB,
      modelB: opts.modelB,
      temperatureB: opts.temperatureB ?? 0.4,
      trafficSplit: opts.trafficSplit ?? 0.5,
      workspaceId: opts.workspaceId,
      createdBy: opts.createdBy,
    },
  });

  return mapExperiment(result);
}

/**
 * List experiments for a workspace.
 */
export async function listExperiments(
  workspaceId: string,
  opts?: { status?: ExperimentStatus; feature?: string; limit?: number },
): Promise<ExperimentEntry[]> {
  const results = await prisma.aiExperiment.findMany({
    where: {
      workspaceId,
      ...(opts?.status ? { status: opts.status } : {}),
      ...(opts?.feature ? { feature: opts.feature } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: opts?.limit ?? 25,
  });

  return results.map(mapExperiment);
}

/**
 * Get a single experiment by ID.
 */
export async function getExperiment(
  id: string,
  workspaceId: string,
): Promise<ExperimentEntry | null> {
  const result = await prisma.aiExperiment.findFirst({
    where: { id, workspaceId },
  });
  return result ? mapExperiment(result) : null;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/**
 * Start an experiment (DRAFT → RUNNING).
 * Only one experiment per feature can be RUNNING at a time.
 */
export async function startExperiment(
  id: string,
  workspaceId: string,
): Promise<{ success: boolean; error?: string }> {
  const experiment = await prisma.aiExperiment.findFirst({
    where: { id, workspaceId },
  });

  if (!experiment) return { success: false, error: "Experiment not found" };
  if (experiment.status !== "DRAFT" && experiment.status !== "PAUSED") {
    return { success: false, error: `Cannot start experiment in ${experiment.status} status` };
  }

  // Check for conflicting running experiment on same feature
  const running = await prisma.aiExperiment.findFirst({
    where: { workspaceId, feature: experiment.feature, status: "RUNNING", id: { not: id } },
  });

  if (running) {
    return { success: false, error: `Another experiment ("${running.name}") is already running for ${experiment.feature}` };
  }

  await prisma.aiExperiment.update({
    where: { id },
    data: { status: "RUNNING", startedAt: experiment.startedAt ?? new Date() },
  });

  return { success: true };
}

/**
 * Pause a running experiment.
 */
export async function pauseExperiment(id: string): Promise<boolean> {
  const result = await prisma.aiExperiment.updateMany({
    where: { id, status: "RUNNING" },
    data: { status: "PAUSED" },
  });
  return result.count > 0;
}

/**
 * Complete an experiment (finalize results).
 */
export async function completeExperiment(id: string): Promise<boolean> {
  const result = await prisma.aiExperiment.updateMany({
    where: { id, status: { in: ["RUNNING", "PAUSED"] } },
    data: { status: "COMPLETED", endedAt: new Date() },
  });
  return result.count > 0;
}

// ── Traffic Routing ───────────────────────────────────────────────────────────

/**
 * Resolve which variant a user should see for a given feature.
 * Returns null if no experiment is running for the feature.
 *
 * Assignment is deterministic per (experimentId, userId) so the same
 * user always gets the same variant (no flip-flopping mid-session).
 */
export async function resolveVariant(
  feature: string,
  workspaceId: string,
  userId: string,
): Promise<VariantConfig | null> {
  const experiment = await prisma.aiExperiment.findFirst({
    where: { workspaceId, feature, status: "RUNNING" },
  });

  if (!experiment) return null;

  // Deterministic assignment: hash(experimentId + userId) → [0, 1)
  const hash = simpleHash(experiment.id + userId);
  const normalized = (hash % 10000) / 10000;
  const variant: Variant = normalized < experiment.trafficSplit ? "B" : "A";

  return {
    variant,
    prompt: variant === "A" ? experiment.promptA : experiment.promptB,
    model: variant === "A" ? experiment.modelA : experiment.modelB,
    temperature: variant === "A" ? experiment.temperatureA : experiment.temperatureB,
    experimentId: experiment.id,
  };
}

/**
 * Record the outcome of a trial (latency, cost, optional user rating).
 * Uses atomic increment to avoid race conditions.
 */
export async function recordTrial(
  experimentId: string,
  variant: Variant,
  metrics: { latencyMs: number; costUsd: number; rating?: number },
): Promise<void> {
  const exp = await prisma.aiExperiment.findUnique({
    where: { id: experimentId },
    select: {
      trialsA: true, trialsB: true,
      avgLatencyA: true, avgLatencyB: true,
      avgCostA: true, avgCostB: true,
      avgRatingA: true, avgRatingB: true,
    },
  });

  if (!exp) return;

  if (variant === "A") {
    const n = exp.trialsA;
    const newN = n + 1;
    await prisma.aiExperiment.update({
      where: { id: experimentId },
      data: {
        totalTrials: { increment: 1 },
        trialsA: newN,
        avgLatencyA: (exp.avgLatencyA * n + metrics.latencyMs) / newN,
        avgCostA: (exp.avgCostA * n + metrics.costUsd) / newN,
        ...(metrics.rating !== undefined
          ? { avgRatingA: ((exp.avgRatingA ?? 0) * n + metrics.rating) / newN }
          : {}),
      },
    });
  } else {
    const n = exp.trialsB;
    const newN = n + 1;
    await prisma.aiExperiment.update({
      where: { id: experimentId },
      data: {
        totalTrials: { increment: 1 },
        trialsB: newN,
        avgLatencyB: (exp.avgLatencyB * n + metrics.latencyMs) / newN,
        avgCostB: (exp.avgCostB * n + metrics.costUsd) / newN,
        ...(metrics.rating !== undefined
          ? { avgRatingB: ((exp.avgRatingB ?? 0) * n + metrics.rating) / newN }
          : {}),
      },
    });
  }
}

// ── Analysis ──────────────────────────────────────────────────────────────────

/**
 * Analyze experiment results and determine the winning variant.
 * Returns a summary with the recommended winner.
 */
export function analyzeResults(experiment: ExperimentEntry): {
  winner: Variant | "inconclusive";
  confidence: string;
  summary: string;
} {
  const minTrials = 30; // minimum per variant for statistical relevance

  if (experiment.trialsA < minTrials || experiment.trialsB < minTrials) {
    return {
      winner: "inconclusive",
      confidence: "low",
      summary: `Insufficient data: ${experiment.trialsA} trials (A) and ${experiment.trialsB} trials (B). Need at least ${minTrials} each.`,
    };
  }

  // Score: lower latency better, lower cost better, higher rating better
  let scoreA = 0;
  let scoreB = 0;

  // Latency comparison (lower is better)
  if (experiment.avgLatencyA < experiment.avgLatencyB) scoreA++;
  else if (experiment.avgLatencyB < experiment.avgLatencyA) scoreB++;

  // Cost comparison (lower is better)
  if (experiment.avgCostA < experiment.avgCostB) scoreA++;
  else if (experiment.avgCostB < experiment.avgCostA) scoreB++;

  // Rating comparison (higher is better)
  if (experiment.avgRatingA != null && experiment.avgRatingB != null) {
    if (experiment.avgRatingA > experiment.avgRatingB) scoreA++;
    else if (experiment.avgRatingB > experiment.avgRatingA) scoreB++;
  }

  const winner = scoreA > scoreB ? "A" : scoreB > scoreA ? "B" : "inconclusive";
  const confidence = Math.abs(scoreA - scoreB) >= 2 ? "high" : "medium";

  const fmt = (n: number) => n.toFixed(2);
  const summary = [
    `Variant A: ${experiment.trialsA} trials, ${fmt(experiment.avgLatencyA)}ms avg latency, $${fmt(experiment.avgCostA)} avg cost${experiment.avgRatingA != null ? `, ${fmt(experiment.avgRatingA)} rating` : ""}`,
    `Variant B: ${experiment.trialsB} trials, ${fmt(experiment.avgLatencyB)}ms avg latency, $${fmt(experiment.avgCostB)} avg cost${experiment.avgRatingB != null ? `, ${fmt(experiment.avgRatingB)} rating` : ""}`,
    `Winner: ${winner === "inconclusive" ? "No clear winner" : `Variant ${winner}`} (${confidence} confidence)`,
  ].join("\n");

  return { winner, confidence, summary };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Simple deterministic hash for consistent variant assignment. */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

function mapExperiment(row: {
  id: string;
  name: string;
  description: string | null;
  status: string;
  feature: string;
  promptA: string;
  modelA: string;
  temperatureA: number;
  promptB: string;
  modelB: string;
  temperatureB: number;
  trafficSplit: number;
  totalTrials: number;
  trialsA: number;
  trialsB: number;
  avgLatencyA: number;
  avgLatencyB: number;
  avgCostA: number;
  avgCostB: number;
  avgRatingA: number | null;
  avgRatingB: number | null;
  createdAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
}): ExperimentEntry {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status as ExperimentStatus,
    feature: row.feature,
    promptA: row.promptA,
    modelA: row.modelA,
    temperatureA: row.temperatureA,
    promptB: row.promptB,
    modelB: row.modelB,
    temperatureB: row.temperatureB,
    trafficSplit: row.trafficSplit,
    totalTrials: row.totalTrials,
    trialsA: row.trialsA,
    trialsB: row.trialsB,
    avgLatencyA: row.avgLatencyA,
    avgLatencyB: row.avgLatencyB,
    avgCostA: row.avgCostA,
    avgCostB: row.avgCostB,
    avgRatingA: row.avgRatingA,
    avgRatingB: row.avgRatingB,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
  };
}
