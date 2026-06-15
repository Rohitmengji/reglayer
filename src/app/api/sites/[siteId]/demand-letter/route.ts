/**
 * RegLayer — Demand-Letter Triage API
 *
 * POST /api/sites/[siteId]/demand-letter
 *   body: {
 *     letterText?: string,                    // free-text letter (AI-parsed into claims)
 *     claims?: Array<{ rawText, ruleId?, wcagCriteria?, allegedDate? }>,  // OR manual claims
 *     industry?: string, primaryGeo?: string, // exposure context (defaults from risk score)
 *     format?: "html" | "json"                // default "json"
 *   }
 *
 * Maps each alleged claim onto the site's recorded scan/violation/proof history and returns
 * an adversarial, per-claim rebuttal + exposure-delta. Read-only, NO migration, NO mutation.
 * Access gated by assertSiteAccess.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { assertSiteAccess } from "@/lib/auth/access";
import { parseDemandLetter } from "@/lib/triage/parseDemandLetter";
import { loadTriageData } from "@/lib/triage/loadTriageData";
import { assessClaims, renderTriageHTML, type DemandClaim } from "@/lib/triage/demandLetter";

const bodySchema = z.object({
  letterText: z.string().max(40000).optional(),
  claims: z
    .array(
      z.object({
        rawText: z.string().min(1).max(600),
        ruleId: z.string().max(64).nullish(),
        wcagCriteria: z.string().max(16).nullish(),
        allegedDate: z.string().max(40).nullish(),
      })
    )
    .max(60)
    .optional(),
  industry: z.string().max(40).optional(),
  primaryGeo: z.string().max(40).optional(),
  format: z.enum(["html", "json"]).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { siteId } = await params;
    const access = await assertSiteAccess(siteId, session);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const body = parsed.data;

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, url: true, name: true, workspaceId: true },
    });
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    // Claims: prefer an explicit manual array; otherwise AI-parse the letter text.
    let claims: DemandClaim[];
    if (body.claims && body.claims.length > 0) {
      claims = body.claims.map((c, i) => ({
        index: i + 1,
        rawText: c.rawText,
        ruleId: c.ruleId ?? null,
        wcagCriteria: c.wcagCriteria ?? null,
        allegedDate: c.allegedDate ?? null,
      }));
    } else if (body.letterText && body.letterText.trim()) {
      claims = await parseDemandLetter(body.letterText);
      if (claims.length === 0) {
        return NextResponse.json(
          {
            error:
              "Could not extract any claims from the letter automatically. Provide claims manually, or set OPENAI_API_KEY to enable letter parsing.",
          },
          { status: 422 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Provide either letterText or a non-empty claims array." },
        { status: 400 }
      );
    }

    // Exposure context: explicit override, else the site's latest risk-score context, else defaults.
    let industry = body.industry;
    let primaryGeo = body.primaryGeo;
    if (!industry || !primaryGeo) {
      const latestRisk = await prisma.litigationRiskScore.findFirst({
        where: { siteId },
        orderBy: { calculatedAt: "desc" },
        select: { industry: true, primaryGeo: true },
      });
      industry = industry ?? latestRisk?.industry ?? "other";
      primaryGeo = primaryGeo ?? latestRisk?.primaryGeo ?? "other";
    }

    const data = await loadTriageData({
      site,
      context: { industry, primaryGeo },
      claims,
      generatedAt: new Date(),
    });
    const report = assessClaims(data);

    if (body.format === "html") {
      return new Response(renderTriageHTML(report), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
