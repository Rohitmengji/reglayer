/**
 * RegLayer — Custom rule results for a scan
 *
 * GET /api/scans/[id]/custom-rules — evaluate the scan's workspace custom rules
 * against this scan's score + violations. Returns [] when the workspace has no
 * enabled rules. Auth + ownership via assertScanAccess (IDOR-safe).
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { assertScanAccess } from "@/lib/auth/access";
import {
  evaluateCustomRules,
  summarizeCustomRules,
  toEvaluableRule,
  type CustomRuleViolation,
  type CustomRuleType,
} from "@/lib/compliance/customRules";

/** "wcag111" → "1.1.1" (matches the VPAT generator's mapping). */
function tagToWcagId(tag: string): string {
  const m = tag.match(/^wcag(\d)(\d)(\d+)$/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : tag;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const access = await assertScanAccess(id, session);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const scan = await prisma.scan.findUnique({
    where: { id },
    include: { violations: { select: { ruleId: true, impact: true, tags: true } } },
  });
  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  if (!scan.workspaceId) {
    return NextResponse.json({ results: [], summary: summarizeCustomRules([]) });
  }

  const dbRules = await prisma.complianceRule.findMany({
    where: { workspaceId: scan.workspaceId, enabled: true },
    select: { id: true, name: true, type: true, severity: true, config: true },
    orderBy: { createdAt: "desc" },
  });
  if (dbRules.length === 0) {
    return NextResponse.json({ results: [], summary: summarizeCustomRules([]) });
  }

  const violations: CustomRuleViolation[] = scan.violations.map((v) => ({
    ruleId: v.ruleId,
    impact: v.impact,
    wcagCriteria: v.tags.filter((t) => /^wcag\d/.test(t)).map(tagToWcagId),
  }));

  const rules = dbRules.map((r: { id: string; name: string; type: string; severity: string; config: unknown }) =>
    toEvaluableRule({ id: r.id, name: r.name, type: r.type as CustomRuleType, severity: r.severity, config: r.config })
  );
  const results = evaluateCustomRules(rules, { score: scan.score ?? 0, violations });

  return NextResponse.json({ results, summary: summarizeCustomRules(results) });
}
