/**
 * RegLayer — Fix Genome recommendation API
 *
 * GET /api/genome/recommend?ruleId=<axe-rule>&scope=global|workspace&by=rule|fingerprint
 *
 *   - ruleId present → a confidence-rated recommendation for that rule.
 *   - ruleId absent  → the top aggregates (the genome overview).
 *   - scope=global (default) aggregates ANONYMIZED outcome COUNTS across all tenants — the
 *     network effect; no tenant data is returned, only success rates. scope=workspace
 *     restricts to the caller's own workspaces.
 *
 * Read-only. Requires the fix_outcomes table (pending migration) to return data; until then
 * it responds with an empty genome rather than erroring.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import {
  aggregateOutcomes,
  recommendForRule,
  type FixOutcome,
  type GroupBy,
} from "@/lib/genome/fixGenome";

const MAX_ROWS = 5000;

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const ruleId = sp.get("ruleId")?.trim() || null;
    const scope = sp.get("scope") === "workspace" ? "workspace" : "global";
    const by: GroupBy = sp.get("by") === "fingerprint" ? "fingerprint" : "rule";

    // Resolve the caller's workspaces only when scoping to the workspace.
    let workspaceIds: string[] = [];
    if (scope === "workspace") {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { memberships: { select: { workspaceId: true } } },
      });
      workspaceIds = user?.memberships.map((m) => m.workspaceId) ?? [];
      if (workspaceIds.length === 0) {
        return NextResponse.json({ scope, by, ruleId, aggregates: [], recommendation: null });
      }
    }

    const where = {
      ...(ruleId ? { ruleId } : {}),
      ...(scope === "workspace" ? { workspaceId: { in: workspaceIds } } : {}),
    };

    let rows: Array<{
      ruleId: string;
      fingerprint: string;
      success: boolean;
      daysToEffect: number | null;
      verifiedAt: Date;
      verifiedVia: string;
    }> = [];
    try {
      rows = await prisma.fixOutcomeRecord.findMany({
        where,
        orderBy: { verifiedAt: "desc" },
        take: MAX_ROWS,
        select: {
          ruleId: true,
          fingerprint: true,
          success: true,
          daysToEffect: true,
          verifiedAt: true,
          verifiedVia: true,
        },
      });
    } catch {
      // fix_outcomes table not yet migrated — return an empty genome rather than 500.
      return NextResponse.json({
        scope,
        by,
        ruleId,
        aggregates: [],
        recommendation: ruleId ? recommendForRule(ruleId, []) : null,
        note: "Fix Genome storage is not yet provisioned (migration pending).",
      });
    }

    const outcomes: FixOutcome[] = rows.map((r) => ({
      ruleId: r.ruleId,
      fingerprint: r.fingerprint,
      success: r.success,
      daysToEffect: r.daysToEffect,
      verifiedAt: r.verifiedAt,
      verifiedVia: r.verifiedVia,
    }));

    const aggregates = aggregateOutcomes(outcomes, { by });

    return NextResponse.json({
      scope,
      by,
      ruleId,
      totalOutcomes: outcomes.length,
      aggregates: aggregates.slice(0, 25),
      recommendation: ruleId ? recommendForRule(ruleId, aggregates) : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
