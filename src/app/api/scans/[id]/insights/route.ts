/**
 * RegLayer — Scan Insights API
 *
 * WHY: AI-powered insights help users understand violation patterns and impact.
 * WHAT: GET returns AI-generated insights for a specific scan.
 * HOW: Sends scan violations to AI summarizer, caches result, returns structured insights.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { assertScanAccess } from "@/lib/auth/access";
import { prisma } from "@/lib/database/prisma";
import { consumeCredits } from "@/lib/credits";

/**
 * AI Insights API
 * 
 * GET /api/scans/:id/insights
 * 
 * Generates deep AI explanations for each violation
 * using GPT-4o-mini. Caches results in the violation record.
 * Consumes AI credits (5 per analysis, 1 per cached explanation).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Auth & credit check
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // IDOR guard: verify the caller owns this scan BEFORE loading it or consuming credits.
  const access = await assertScanAccess(id, session);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  // Verify scan exists BEFORE consuming credits
  const scan = await prisma.scan.findUnique({
    where: { id },
    include: { violations: true },
  });

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key not configured" },
      { status: 503 }
    );
  }

  // Consume credits for insights analysis
  const creditResult = await consumeCredits(user.id, "insightsAnalysis");
  if (!creditResult.success) {
    return NextResponse.json(
      { error: "Insufficient AI credits", creditsRemaining: creditResult.creditsRemaining, cost: creditResult.cost },
      { status: 429 }
    );
  }

  // Generate insights for violations that don't have cached explanations
  const insights = await Promise.all(
    scan.violations.map(async (v) => {
      // Return cached if available
      if (v.aiExplanation) {
        return {
          violationId: v.id,
          ruleId: v.ruleId,
          impact: v.impact,
          insight: JSON.parse(v.aiExplanation),
          cached: true,
        };
      }

      // Generate new insight
      const insight = await generateInsight(apiKey, v, scan.url);

      // Cache it
      await prisma.violation.update({
        where: { id: v.id },
        data: { aiExplanation: JSON.stringify(insight) },
      }).catch(() => {/* non-critical */});

      return {
        violationId: v.id,
        ruleId: v.ruleId,
        impact: v.impact,
        insight,
        cached: false,
      };
    })
  );

  return NextResponse.json({
    scanId: id,
    url: scan.url,
    score: scan.score,
    insights,
  });
}

interface ViolationData {
  ruleId: string;
  impact: string;
  description: string;
  help: string;
  tags: string[];
  affectedElements: unknown;
}

async function generateInsight(
  apiKey: string,
  violation: ViolationData,
  pageUrl: string
) {
  const elements = Array.isArray(violation.affectedElements)
    ? (violation.affectedElements as Array<{ html: string }>).slice(0, 3)
    : [];

  const prompt = `You are an accessibility expert. Analyze this violation and provide actionable guidance.

Violation: ${violation.ruleId}
Impact: ${violation.impact}
Description: ${violation.description}
Help: ${violation.help}
WCAG Tags: ${violation.tags.join(", ")}
Page: ${pageUrl}
Affected HTML (sample):
${elements.map((e) => e.html).join("\n")}

Respond in JSON format:
{
  "explanation": "Plain English explanation of why this matters for users with disabilities (2-3 sentences)",
  "userImpact": "Who is affected and how (specific disability groups)",
  "fixStrategy": "Step-by-step fix instructions (be specific to the HTML shown)",
  "codeExample": "Before/after code example showing the fix",
  "effort": "trivial|easy|moderate|complex",
  "priority": "Fix this first because..." (one sentence)
}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    return {
      explanation: violation.description,
      userImpact: "Users with disabilities may be unable to access this content.",
      fixStrategy: violation.help,
      codeExample: "",
      effort: "moderate",
      priority: "Fix to improve accessibility compliance.",
    };
  }

  const data = await response.json();
  try {
    return JSON.parse(data.choices[0].message.content);
  } catch {
    return {
      explanation: violation.description,
      userImpact: "Users with disabilities may be unable to access this content.",
      fixStrategy: violation.help,
      codeExample: "",
      effort: "moderate",
      priority: "Fix to improve accessibility compliance.",
    };
  }
}
