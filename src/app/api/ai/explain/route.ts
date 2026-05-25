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
import { z } from "zod";
import { explainViolation } from "@/lib/ai/explainers/violationExplainer";
import { generateComplianceSummary } from "@/lib/ai/summaries/complianceSummary";

const explainSchema = z.object({
  type: z.enum(["violation", "summary"]),
  violation: z
    .object({
      id: z.string(),
      impact: z.string(),
      description: z.string(),
      help: z.string(),
      wcagTags: z.array(z.string()),
      nodes: z.array(
        z.object({
          html: z.string(),
          target: z.array(z.string()),
          failureSummary: z.string(),
        })
      ),
    })
    .optional(),
  scan: z.unknown().optional(),
  compliance: z.unknown().optional(),
});

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OpenAI API key not configured. Set OPENAI_API_KEY in .env" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const parseResult = explainSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 400 }
      );
    }

    const { type } = parseResult.data;

    if (type === "violation" && parseResult.data.violation) {
      const explanation = await explainViolation(
        parseResult.data.violation as Parameters<typeof explainViolation>[0]
      );
      return NextResponse.json({ explanation });
    }

    if (type === "summary" && parseResult.data.scan && parseResult.data.compliance) {
      const summary = await generateComplianceSummary(
        parseResult.data.scan as Parameters<typeof generateComplianceSummary>[0],
        parseResult.data.compliance as Parameters<typeof generateComplianceSummary>[1]
      );
      return NextResponse.json({ summary });
    }

    return NextResponse.json(
      { error: "Missing required fields for the specified type" },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "AI explanation failed" },
      { status: 500 }
    );
  }
}
