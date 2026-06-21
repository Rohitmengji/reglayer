/**
 * RegLayer — GitHub Issues Integration API
 *
 * WHY: Teams want to auto-create GitHub issues from accessibility violations.
 * WHAT: POST creates GitHub issues for selected violations with labels and assignees.
 * HOW: Uses the GitHub REST API with a Personal Access Token (PAT) supplied by the
 *      client in the request body (owner/repo/token) — there is no GitHub OAuth flow.
 *      Creates issues with violation details + fix guidance.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { assertScanAccess } from "@/lib/auth/access";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
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

  // IDOR guard: only the scan's owner/workspace may file issues from its violations.
  const access = await assertScanAccess(scanId, session);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  // Authorization — filing issues is part of the remediation workflow, so it
  // requires scans.run (MEMBER and above) in the scan's workspace. VIEWERs are
  // read-only and cannot push issues to an external repo.
  const perm = await requireWorkspacePermission("scans.run", { workspaceId: access.workspaceId });
  if (!perm.ok) return perm.response;

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
