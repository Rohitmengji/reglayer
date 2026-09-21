/**
 * ---------------------------------------------------------
 * RegLayer — AI Explain API
 * ---------------------------------------------------------
 *
 * Purpose:
 * HTTP endpoint for AI-powered violation explanations.
 * ---------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { z } from "zod";
import { explainViolation } from "@/lib/ai/explainers/violationExplainer";
import { generateComplianceSummary } from "@/lib/ai/summaries/complianceSummary";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { consumeCredits, refundCredits } from "@/lib/credits";
import { prisma } from "@/lib/database/prisma";
import { isAIAvailable, getDefaultModelId } from "@/lib/ai/gateway";
import { logger } from "@/lib/telemetry/logger";

const impactSchema = z.enum(["critical", "serious", "moderate", "minor"]);
const violationSchema = z.object({
  id: z.string().min(1).max(200),
  impact: impactSchema,
  description: z.string().max(10000),
  help: z.string().max(10000),
  helpUrl: z.string().max(2048).default(""),
  wcagTags: z.array(z.string().max(100)).max(100),
  nodes: z.array(z.object({
    html: z.string().max(100000),
    target: z.array(z.string().max(10000)).max(100),
    failureSummary: z.string().max(20000),
  })).max(1000),
});

const explainSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("violation"), violation: violationSchema }),
  z.object({
    type: z.literal("summary"),
    scan: z.object({
      id: z.string().min(1).max(200), url: z.string().url().max(2048), timestamp: z.string().max(100),
      status: z.literal("completed"),
      summary: z.object({
        score: z.number().min(0).max(100), totalViolations: z.number().int().nonnegative(),
        critical: z.number().int().nonnegative(), serious: z.number().int().nonnegative(),
        moderate: z.number().int().nonnegative(), minor: z.number().int().nonnegative(),
      }),
      violations: z.array(violationSchema).max(1000),
      metadata: z.object({ pageTitle: z.string().max(10000), scanDuration: z.number().nonnegative(), browserEngine: z.string().max(100), axeCoreVersion: z.string().max(100) }),
    }),
    compliance: z.object({
      scanId: z.string().min(1).max(200), timestamp: z.string().max(100), overallCompliance: z.number().min(0).max(100),
      ruleResults: z.array(z.object({
        rule: z.object({ id: z.string().max(200), name: z.string().max(1000), description: z.string().max(10000), regulation: z.string().max(1000), wcagCriteria: z.array(z.string().max(100)).max(100), severity: impactSchema }),
        passed: z.boolean(), violations: z.array(violationSchema).max(1000),
      })).max(1000),
    }),
  }).refine((body) => body.scan.id === body.compliance.scanId, { message: "Scan and compliance report must match" }),
]);

export async function POST(request: NextRequest) {
  try {
    return await handleExplanation(request);
  } catch {
    logger.error("AI explanation request could not be processed");
    return NextResponse.json({ error: "AI explanation is unavailable. Please try again later." }, { status: 503 });
  }
}

async function handleExplanation(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Rate limit AI requests
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await rateLimit(`ai:${ip}`, RATE_LIMITS.ai, "ai");
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many AI requests. Please wait." },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = explainSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid explanation request" }, { status: 400 });

  if (!isAIAvailable() || !getDefaultModelId()) {
    return NextResponse.json({ error: "AI explanations are unavailable. Please try again later." }, { status: 503 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, isMasterAdmin: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const creditResult = await consumeCredits(user.id, "explanation");
  if (!creditResult.success) {
    return NextResponse.json(
      { error: "Insufficient AI credits", creditsRemaining: creditResult.creditsRemaining, cost: creditResult.cost, upgradeRequired: true },
      { status: 429 }
    );
  }

  try {
    if (parsed.data.type === "violation") {
      const explanation = await explainViolation(parsed.data.violation);
      if (!explanation) throw new Error("No valid explanation");
      return NextResponse.json({ explanation });
    }

    const summary = await generateComplianceSummary(parsed.data.scan, parsed.data.compliance);
    if (!summary) throw new Error("No valid summary");
    return NextResponse.json({ summary });
  } catch {
    if (creditResult.cost > 0) {
      try {
        await refundCredits(user.id, "explanation", { isMasterAdmin: user.isMasterAdmin });
      } catch {
        logger.error("AI explanation credit refund failed", { userId: user.id, action: "explanation" });
        return NextResponse.json({ error: "The explanation failed and the credit could not be restored. Contact support before retrying.", code: "CREDIT_REFUND_FAILED" }, { status: 503 });
      }
    }
    return NextResponse.json({ error: "No usable AI explanation was returned. Please try again.", code: "AI_GENERATION_FAILED" }, { status: 502 });
  }
}
