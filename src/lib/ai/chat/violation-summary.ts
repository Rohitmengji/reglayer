/**
 * RegLayer — violation summary read
 *
 * Supplies the authoritative counts that chat quotes, so "how many" is answered from
 * the database instead of by counting the retrieval window. Reasoning and wording live
 * in `./violation-summary-format`; this file is only the query.
 *
 * The scope and the aggregation deliberately mirror `/api/dashboard/stats` so chat and
 * the dashboard cannot report different numbers for the same question.
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import type { ViolationSummary } from "./violation-summary-format";

export {
  formatViolationSummaryForPrompt,
  type ViolationSummary,
} from "./violation-summary-format";

/** How many rules to name individually before the tail is summarised as "other". */
const MAX_RULES_LISTED = 15;

export async function getViolationSummary(args: {
  workspaceId: string | null;
  userId: string;
  isMasterAdmin: boolean;
}): Promise<ViolationSummary> {
  // Same rule as the dashboard: a master admin sees the whole workspace, everyone
  // else sees their own scans. Diverging here would make chat and the dashboard
  // disagree for exactly the users most likely to notice.
  const scopeFilter =
    args.isMasterAdmin && args.workspaceId
      ? { workspaceId: args.workspaceId }
      : { userId: args.userId };

  const [agg, latest, byRule, byImpact, urls] = await Promise.all([
    prisma.scan.aggregate({
      where: { status: "COMPLETED", ...scopeFilter },
      _avg: { score: true },
      _sum: { totalViolations: true },
      _count: true,
    }),
    prisma.scan.findFirst({
      where: { status: "COMPLETED", ...scopeFilter },
      orderBy: { createdAt: "desc" },
      select: { url: true, completedAt: true, createdAt: true, totalViolations: true },
    }),
    prisma.violation.groupBy({
      by: ["ruleId", "impact"],
      where: { scan: { status: "COMPLETED", ...scopeFilter } },
      _count: { ruleId: true },
      orderBy: { _count: { ruleId: "desc" } },
      take: MAX_RULES_LISTED,
    }),
    // Severity comes from the violation rows, NOT from Scan.critical/serious/...
    //
    // Those denormalised columns do not agree with the rows they summarise. Measured
    // on real data: rows = 94 and Scan.totalViolations = 94, but the severity columns
    // sum to 313 (6/135/168/4) — inflated ~3.3x, most likely counting affected
    // elements rather than findings. Quoting them would hand the model a block whose
    // breakdown contradicts its own total, which is precisely the failure this whole
    // summary exists to stop.
    prisma.violation.groupBy({
      by: ["impact"],
      where: { scan: { status: "COMPLETED", ...scopeFilter } },
      _count: { _all: true },
    }),
    prisma.scan.groupBy({
      by: ["url"],
      where: { status: "COMPLETED", ...scopeFilter },
    }),
  ]);

  const severity = (impact: string) =>
    byImpact.find((b) => String(b.impact) === impact)?._count._all ?? 0;

  return {
    scanCount: agg._count,
    siteCount: urls.length,
    avgScore: agg._avg.score !== null ? Math.round(agg._avg.score) : null,
    latest: latest
      ? {
          url: latest.url,
          scannedAt: latest.completedAt ?? latest.createdAt,
          violations: latest.totalViolations,
        }
      : null,
    total: agg._sum.totalViolations ?? 0,
    critical: severity("critical"),
    serious: severity("serious"),
    moderate: severity("moderate"),
    minor: severity("minor"),
    byRule: byRule.map((g) => ({
      ruleId: g.ruleId,
      impact: String(g.impact),
      count: g._count.ruleId,
    })),
  };
}
