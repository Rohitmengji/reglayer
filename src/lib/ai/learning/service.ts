/**
 * RegLayer — Long-Term Learning Service
 *
 * Continuous improvement loop: Feedback → Evaluation → Prompt Improvement → Better Responses.
 *
 * THE LOOP:
 *   1. User rates AI responses (thumbs up/down, 1-5 stars, comments)
 *   2. System aggregates feedback per prompt/model/feature
 *   3. Detects patterns: "users dislike tone in violation-explainer"
 *   4. Proposes prompt improvements (auto-generated or from experiment winners)
 *   5. Human reviews and approves improvements
 *   6. Applied improvements feed into better future responses
 *
 * WHY:
 *   Static prompts degrade over time. User expectations shift. New regulations
 *   appear. Without a learning loop, the AI gets worse as the product grows.
 *
 * INSPIRED BY:
 *   - RLHF (Reinforcement Learning from Human Feedback) — but without training
 *   - OpenAI's model improvement pipeline (feedback → fine-tuning)
 *   - Notion AI's prompt iteration cycle
 *   - Anthropic's Constitutional AI (self-improvement with rules)
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { inferPreferences } from "@/lib/ai/profile/service";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FeedbackInput {
  userId: string;
  workspaceId?: string;
  feature: string;
  rating: number;
  comment?: string;
  category?: string;
  messageId?: string;
  promptId?: string;
  model?: string;
  query?: string;
  response?: string;
  context?: Record<string, unknown>;
}

export interface FeedbackAnalysis {
  promptId: string;
  totalFeedback: number;
  avgRating: number;
  ratingDistribution: Record<number, number>;
  topComplaints: string[];
  topPraises: string[];
  modelComparison: { model: string; avgRating: number; count: number }[];
  trend: "improving" | "declining" | "stable";
}

export interface ImprovementProposal {
  id: string;
  promptId: string;
  improvementType: string;
  description: string;
  source: string;
  status: string;
}

// ── Feedback Collection ───────────────────────────────────────────────────────

/**
 * Record user feedback on an AI response.
 * Triggers profile inference after every 10th feedback.
 */
export async function recordFeedback(input: FeedbackInput): Promise<string> {
  const entry = await prisma.feedbackEntry.create({
    data: {
      rating: input.rating,
      comment: input.comment ?? null,
      category: input.category ?? null,
      feature: input.feature,
      messageId: input.messageId ?? null,
      promptId: input.promptId ?? null,
      model: input.model ?? null,
      query: input.query ?? null,
      response: input.response ?? null,
      context: (input.context as object) ?? undefined,
      userId: input.userId,
      workspaceId: input.workspaceId ?? null,
    },
  });

  // Update user profile stats
  await prisma.userProfile.upsert({
    where: { userId: input.userId },
    update: {
      totalFeedback: { increment: 1 },
    },
    create: {
      userId: input.userId,
      totalFeedback: 1,
    },
  });

  // Every 10th feedback, re-infer preferences
  const count = await prisma.feedbackEntry.count({ where: { userId: input.userId } });
  if (count % 10 === 0) {
    inferPreferences(input.userId).catch(() => {}); // fire-and-forget
  }

  return entry.id;
}

// ── Feedback Analysis ─────────────────────────────────────────────────────────

/**
 * Analyze feedback for a specific prompt template.
 * Returns aggregate metrics, complaints, praises, and model comparison.
 */
export async function analyzeFeedback(promptId: string): Promise<FeedbackAnalysis> {
  const feedback = await prisma.feedbackEntry.findMany({
    where: { promptId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { rating: true, comment: true, model: true, createdAt: true },
  });

  if (feedback.length === 0) {
    return {
      promptId,
      totalFeedback: 0,
      avgRating: 0,
      ratingDistribution: {},
      topComplaints: [],
      topPraises: [],
      modelComparison: [],
      trend: "stable",
    };
  }

  // Rating distribution
  const distribution: Record<number, number> = {};
  for (const f of feedback) {
    distribution[f.rating] = (distribution[f.rating] ?? 0) + 1;
  }

  // Average rating
  const avgRating = feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length;

  // Separate complaints (low rating + comment) and praises
  const complaints = feedback
    .filter((f) => f.rating <= 2 && f.comment)
    .map((f) => f.comment!)
    .slice(0, 5);

  const praises = feedback
    .filter((f) => f.rating >= 4 && f.comment)
    .map((f) => f.comment!)
    .slice(0, 5);

  // Model comparison
  const modelStats = new Map<string, { total: number; count: number }>();
  for (const f of feedback) {
    if (f.model) {
      const stat = modelStats.get(f.model) ?? { total: 0, count: 0 };
      stat.total += f.rating;
      stat.count++;
      modelStats.set(f.model, stat);
    }
  }
  const modelComparison = Array.from(modelStats.entries()).map(([model, stat]) => ({
    model,
    avgRating: Math.round((stat.total / stat.count) * 100) / 100,
    count: stat.count,
  }));

  // Trend: compare first half vs second half of feedback
  const mid = Math.floor(feedback.length / 2);
  const recentAvg = feedback.slice(0, mid).reduce((s, f) => s + f.rating, 0) / mid;
  const olderAvg = feedback.slice(mid).reduce((s, f) => s + f.rating, 0) / (feedback.length - mid);
  const trend = recentAvg > olderAvg + 0.3 ? "improving" : recentAvg < olderAvg - 0.3 ? "declining" : "stable";

  return {
    promptId,
    totalFeedback: feedback.length,
    avgRating: Math.round(avgRating * 100) / 100,
    ratingDistribution: distribution,
    topComplaints: complaints,
    topPraises: praises,
    modelComparison,
    trend,
  };
}

// ── Improvement Proposals ─────────────────────────────────────────────────────

/**
 * Propose a prompt improvement based on feedback analysis.
 */
export async function proposeImprovement(opts: {
  promptId: string;
  version: number;
  improvementType: string;
  description: string;
  originalSegment?: string;
  improvedSegment?: string;
  source: string;
  feedbackCount?: number;
  avgRatingBefore?: number;
}): Promise<ImprovementProposal> {
  const result = await prisma.promptImprovement.create({
    data: {
      promptId: opts.promptId,
      version: opts.version,
      improvementType: opts.improvementType,
      description: opts.description,
      originalSegment: opts.originalSegment ?? null,
      improvedSegment: opts.improvedSegment ?? null,
      source: opts.source,
      feedbackCount: opts.feedbackCount ?? 0,
      avgRatingBefore: opts.avgRatingBefore ?? null,
    },
  });

  return {
    id: result.id,
    promptId: result.promptId,
    improvementType: result.improvementType,
    description: result.description,
    source: result.source,
    status: result.status,
  };
}

/**
 * List pending improvement proposals.
 */
export async function listProposals(opts?: {
  promptId?: string;
  status?: string;
  limit?: number;
}): Promise<ImprovementProposal[]> {
  const results = await prisma.promptImprovement.findMany({
    where: {
      ...(opts?.promptId ? { promptId: opts.promptId } : {}),
      ...(opts?.status ? { status: opts.status as any } : {}), // eslint-disable-line @typescript-eslint/no-explicit-any
    },
    orderBy: { createdAt: "desc" },
    take: opts?.limit ?? 25,
  });

  return results.map((r) => ({
    id: r.id,
    promptId: r.promptId,
    improvementType: r.improvementType,
    description: r.description,
    source: r.source,
    status: r.status,
  }));
}

/**
 * Approve and apply a proposed improvement.
 */
export async function applyImprovement(id: string, approverUserId: string): Promise<boolean> {
  const result = await prisma.promptImprovement.updateMany({
    where: { id, status: "PROPOSED" },
    data: {
      status: "APPLIED",
      appliedAt: new Date(),
      appliedBy: approverUserId,
    },
  });
  return result.count > 0;
}

/**
 * Reject a proposed improvement.
 */
export async function rejectImprovement(id: string): Promise<boolean> {
  const result = await prisma.promptImprovement.updateMany({
    where: { id, status: "PROPOSED" },
    data: { status: "REJECTED" },
  });
  return result.count > 0;
}

// ── Learning Cycle ────────────────────────────────────────────────────────────

/**
 * Run the full learning cycle for a prompt:
 *   1. Analyze feedback
 *   2. Detect declining quality
 *   3. Auto-propose improvements if rating is below threshold
 *
 * Called periodically (e.g., weekly) or after significant feedback volume.
 */
export async function runLearningCycle(promptId: string): Promise<{
  analysis: FeedbackAnalysis;
  proposed: ImprovementProposal | null;
}> {
  const analysis = await analyzeFeedback(promptId);

  // Only propose improvements if there's enough data and quality is declining
  if (analysis.totalFeedback < 10 || analysis.trend !== "declining") {
    return { analysis, proposed: null };
  }

  // Auto-propose based on detected issues
  let description = "";
  let improvementType = "rewrite";

  if (analysis.avgRating < 3.0) {
    description = `Average rating is ${analysis.avgRating}/5 (declining trend). `;
    if (analysis.topComplaints.length > 0) {
      description += `Top complaints: ${analysis.topComplaints.slice(0, 3).join("; ")}`;
    }
  }

  // Check if a specific model performs better — suggest model switch
  if (analysis.modelComparison.length >= 2) {
    const sorted = [...analysis.modelComparison].sort((a, b) => b.avgRating - a.avgRating);
    if (sorted[0].avgRating - sorted[sorted.length - 1].avgRating > 0.5) {
      description += ` Model ${sorted[0].model} (${sorted[0].avgRating}) outperforms ${sorted[sorted.length - 1].model} (${sorted[sorted.length - 1].avgRating}).`;
      improvementType = "model_switch";
    }
  }

  if (!description) {
    return { analysis, proposed: null };
  }

  const proposed = await proposeImprovement({
    promptId,
    version: 0,
    improvementType,
    description: description.trim(),
    source: "auto_learning",
    feedbackCount: analysis.totalFeedback,
    avgRatingBefore: analysis.avgRating,
  });

  return { analysis, proposed };
}

/**
 * Get learning status across all prompts (dashboard view).
 */
export async function getLearningOverview(): Promise<{
  totalFeedback: number;
  avgRating: number;
  pendingImprovements: number;
  appliedImprovements: number;
}> {
  const [totalFeedback, avgResult, pending, applied] = await Promise.all([
    prisma.feedbackEntry.count(),
    prisma.feedbackEntry.aggregate({ _avg: { rating: true } }),
    prisma.promptImprovement.count({ where: { status: "PROPOSED" } }),
    prisma.promptImprovement.count({ where: { status: "APPLIED" } }),
  ]);

  return {
    totalFeedback,
    avgRating: Math.round((avgResult._avg.rating ?? 0) * 100) / 100,
    pendingImprovements: pending,
    appliedImprovements: applied,
  };
}
