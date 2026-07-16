/**
 * RegLayer — Semantic User Profile
 *
 * Instead of just name + email, stores rich behavioral context:
 * writing style, domain expertise, tech stack, preferred models,
 * usage patterns, and inferred preferences.
 *
 * WHY: A compliance auditor and a frontend developer asking the same question
 * need fundamentally different answers. The profile ensures the AI adapts.
 *
 * HOW IT WORKS:
 *   1. Explicit preferences — user sets in settings UI
 *   2. Usage tracking — auto-updates from tool/feature usage
 *   3. Behavioral inference — analyzes feedback patterns to infer preferences
 *   4. Prompt injection — formatProfileForPrompt() injects into LLM context
 *
 * INSPIRED BY:
 *   - ChatGPT Memory (remembers preferences)
 *   - Spotify's taste profile (inferred from behavior)
 *   - Netflix recommendations (behavioral signals)
 *   - Cursor's codebase awareness (project context)
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SemanticProfile {
  userId: string;
  // Communication
  writingStyle: string | null;
  preferredTone: string | null;
  preferredModel: string | null;
  language: string | null;
  // Domain
  domainExpertise: string[];
  industries: string[];
  techStack: string[];
  wcagLevel: string | null;
  regulations: string[];
  // Usage
  frequentTools: string[];
  topFeatures: string[];
  totalQueries: number;
  totalFeedback: number;
  avgRating: number | null;
  // Behavioral
  prefersCodeExamples: boolean;
  prefersCitations: boolean;
  prefersShortAnswers: boolean;
}

// ── Profile CRUD ──────────────────────────────────────────────────────────────

/**
 * Get or create a user's semantic profile.
 */
export async function getProfile(userId: string): Promise<SemanticProfile> {
  const profile = await prisma.userProfile.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  return mapProfile(profile);
}

/**
 * Update explicit user preferences (from settings UI).
 */
export async function updateProfile(
  userId: string,
  updates: Partial<Pick<SemanticProfile,
    "writingStyle" | "preferredTone" | "preferredModel" | "language" |
    "domainExpertise" | "industries" | "techStack" | "wcagLevel" | "regulations" |
    "prefersCodeExamples" | "prefersCitations" | "prefersShortAnswers"
  >>,
): Promise<SemanticProfile> {
  const result = await prisma.userProfile.upsert({
    where: { userId },
    update: updates,
    create: { userId, ...updates },
  });

  return mapProfile(result);
}

// ── Usage Tracking ────────────────────────────────────────────────────────────

/**
 * Track a user interaction — updates usage patterns automatically.
 * Called after every AI feature invocation (chat, scan, agent, etc.).
 */
export async function trackUsage(
  userId: string,
  feature: string,
  toolsUsed?: string[],
): Promise<void> {
  const profile = await prisma.userProfile.upsert({
    where: { userId },
    update: { totalQueries: { increment: 1 } },
    create: { userId, totalQueries: 1 },
  });

  // Update top features (keep top 10 by frequency)
  const features = [...profile.topFeatures];
  if (!features.includes(feature)) {
    features.push(feature);
    if (features.length > 10) features.shift();
  }

  // Update frequent tools
  const tools = [...profile.frequentTools];
  if (toolsUsed) {
    for (const tool of toolsUsed) {
      if (!tools.includes(tool)) {
        tools.push(tool);
        if (tools.length > 15) tools.shift();
      }
    }
  }

  await prisma.userProfile.update({
    where: { userId },
    data: { topFeatures: features, frequentTools: tools },
  });
}

// ── Behavioral Inference ──────────────────────────────────────────────────────

/**
 * Analyze a user's feedback history to infer behavioral preferences.
 * Run periodically (e.g., after every 10 feedbacks) to keep profile current.
 */
export async function inferPreferences(userId: string): Promise<void> {
  // Get recent feedback
  const feedback = await prisma.feedbackEntry.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { rating: true, category: true, response: true, feature: true },
  });

  if (feedback.length < 5) return; // not enough data

  const updates: Record<string, unknown> = {};

  // Infer code preference: do highly-rated responses contain code blocks?
  const highRated = feedback.filter((f) => f.rating >= 4);
  const withCode = highRated.filter((f) => f.response?.includes("```"));
  if (highRated.length >= 3) {
    updates.prefersCodeExamples = withCode.length / highRated.length > 0.5;
  }

  // Infer brevity preference: are short responses rated higher?
  const shortResponses = highRated.filter((f) => (f.response?.length ?? 0) < 500);
  const longResponses = highRated.filter((f) => (f.response?.length ?? 0) > 1500);
  if (shortResponses.length > longResponses.length * 2) {
    updates.prefersShortAnswers = true;
  } else if (longResponses.length > shortResponses.length * 2) {
    updates.prefersShortAnswers = false;
  }

  // Update average rating
  const avgRating = feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length;
  updates.avgRating = Math.round(avgRating * 100) / 100;
  updates.totalFeedback = feedback.length;

  if (Object.keys(updates).length > 0) {
    await prisma.userProfile.upsert({
      where: { userId },
      update: updates,
      create: { userId, ...updates } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    });
  }
}

// ── Prompt Injection ──────────────────────────────────────────────────────────

/**
 * Format the user profile as context for LLM system prompt injection.
 * Only includes fields that are set (no noise from empty defaults).
 */
export function formatProfileForPrompt(profile: SemanticProfile): string {
  const lines: string[] = [];

  // Communication style
  if (profile.writingStyle) lines.push(`Writing style: ${profile.writingStyle}`);
  if (profile.preferredTone) lines.push(`Preferred tone: ${profile.preferredTone}`);
  if (profile.language && profile.language !== "en") lines.push(`Response language: ${profile.language}`);

  // Domain context
  if (profile.domainExpertise.length > 0) lines.push(`Domain expertise: ${profile.domainExpertise.join(", ")}`);
  if (profile.industries.length > 0) lines.push(`Industry: ${profile.industries.join(", ")}`);
  if (profile.techStack.length > 0) lines.push(`Tech stack: ${profile.techStack.join(", ")}`);
  if (profile.wcagLevel) lines.push(`WCAG target: Level ${profile.wcagLevel}`);
  if (profile.regulations.length > 0) lines.push(`Compliance regulations: ${profile.regulations.join(", ")}`);

  // Behavioral signals
  if (profile.prefersCodeExamples) lines.push("Prefers responses with code examples");
  if (profile.prefersShortAnswers) lines.push("Prefers concise, short answers");
  if (!profile.prefersCitations) lines.push("Citations are not needed");

  if (lines.length === 0) return "";

  return "## User Profile\n" + lines.map((l) => `- ${l}`).join("\n");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapProfile(row: {
  userId: string; writingStyle: string | null; preferredTone: string | null;
  preferredModel: string | null; language: string | null;
  domainExpertise: string[]; industries: string[]; techStack: string[];
  wcagLevel: string | null; regulations: string[];
  frequentTools: string[]; topFeatures: string[];
  totalQueries: number; totalFeedback: number; avgRating: number | null;
  prefersCodeExamples: boolean; prefersCitations: boolean; prefersShortAnswers: boolean;
}): SemanticProfile {
  return { ...row };
}
