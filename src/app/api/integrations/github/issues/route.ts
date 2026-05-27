import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { z } from "zod";
import { createBatchIssue, createIssueFromViolation } from "@/lib/integrations/github";
import { prisma } from "@/lib/database/prisma";

const createIssueSchema = z.object({
  scanId: z.string(),
  owner: z.string(),
  repo: z.string(),
  token: z.string(),
  mode: z.enum(["batch", "individual"]).default("batch"),
  violationIds: z.array(z.string()).optional(),
});

/**
 * POST /api/integrations/github/issues
 * 
 * Creates GitHub issues from scan violations.
 * Mode "batch" creates a single issue with all violations.
 * Mode "individual" creates one issue per violation.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createIssueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { scanId, owner, repo, token, mode, violationIds } = parsed.data;
  const config = { token, owner, repo };
  const reportUrl = `${request.nextUrl.origin}/report/${scanId}`;

  try {
    if (mode === "batch") {
      const result = await createBatchIssue(config, scanId, reportUrl);
      return NextResponse.json({
        created: 1,
        issues: [{ number: result.number, url: result.url }],
      });
    }

    // Individual mode
    const scan = await prisma.scan.findUnique({
      where: { id: scanId },
      include: { violations: true },
    });

    if (!scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    const targetViolations = violationIds
      ? scan.violations.filter((v) => violationIds.includes(v.id))
      : scan.violations;

    const issues: Array<{ number: number; url: string; ruleId: string }> = [];

    for (const v of targetViolations) {
      const result = await createIssueFromViolation(
        config,
        {
          ruleId: v.ruleId,
          impact: v.impact,
          help: v.help,
          description: v.description,
          helpUrl: v.helpUrl,
          tags: v.tags,
          affectedElements: v.affectedElements,
        },
        scan.url,
        scanId,
        reportUrl
      );
      issues.push({ ...result, ruleId: v.ruleId });

      // Rate limit: GitHub has 5000 requests/hour
      await new Promise((r) => setTimeout(r, 500));
    }

    return NextResponse.json({ created: issues.length, issues });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create issues" },
      { status: 500 }
    );
  }
}
