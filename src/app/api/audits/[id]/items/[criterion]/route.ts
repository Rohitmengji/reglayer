/**
 * WHY: Records human verdicts for individual WCAG criteria in the manual test plan.
 * WHAT: PATCH /api/audits/[id]/items/[criterion] — write verdict + note, recompute scores.
 * HOW: Auth → IDOR → validate → write into findings JSON → recompute manualScore/combinedScore.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { applyRateLimit } from "@/lib/rate-limit-middleware";
import { rollupManualScore, combineScores } from "@/lib/testing/manualScore";
import { PLAN_LIMITS, type PlanType } from "@/lib/credits/plan-limits";
import type { ManualTestPlan, ManualTestItem, ManualVerdict } from "@/lib/testing/manualTestPlan";
import { z } from "zod";

const verdictSchema = z.object({
  verdict: z.enum(["pass", "fail", "na"]),
  note: z.string().max(2000).nullable(),
}).refine(
  (data) => data.verdict !== "fail" || (data.note && data.note.trim().length > 0),
  { message: "A note is required when verdict is 'fail'", path: ["note"] }
);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; criterion: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Rate limit
    const rl = await applyRateLimit(request, "api");
    if (rl) return rl;

    const { id, criterion } = await params;

    // Parse body
    const body = await request.json();
    const parsed = verdictSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }

    const { verdict, note } = parsed.data;

    // Load user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, memberships: { select: { workspaceId: true } } },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    // Load audit
    const audit = await prisma.auditRequest.findUnique({
      where: { id },
      select: {
        id: true,
        workspaceId: true,
        type: true,
        findings: true,
        automatedScore: true,
      },
    });

    if (!audit) {
      return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }

    // IDOR guard
    const workspaceIds = user.memberships.map((m) => m.workspaceId);
    if (!workspaceIds.includes(audit.workspaceId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Plan gate — manualTesting feature required
    const workspace = await prisma.workspace.findUnique({
      where: { id: audit.workspaceId },
      select: { plan: true },
    });
    const planType = (workspace?.plan ?? "FREE") as PlanType;
    const features = PLAN_LIMITS[planType]?.features;
    if (!features || !("manualTesting" in features) || !features.manualTesting) {
      return NextResponse.json(
        { error: "Manual testing requires a PRO or Enterprise plan", upgradeRequired: true },
        { status: 403 }
      );
    }

    if (audit.type !== "manual-test") {
      return NextResponse.json({ error: "Not a manual test audit" }, { status: 400 });
    }

    const plan = audit.findings as unknown as ManualTestPlan | null;
    if (!plan || !plan.items) {
      return NextResponse.json({ error: "No test plan found" }, { status: 404 });
    }

    // Find the item by criterion
    const itemIndex = plan.items.findIndex((item) => item.criterion === criterion);
    if (itemIndex === -1) {
      return NextResponse.json({ error: `Criterion ${criterion} not found in plan` }, { status: 404 });
    }

    // Update the item
    const now = new Date().toISOString();
    const updatedItem: ManualTestItem = {
      ...plan.items[itemIndex],
      verdict: verdict as ManualVerdict,
      note: note ?? null,
      attestedBy: user.id,
      attestedAt: now,
    };

    const updatedItems = [...plan.items];
    updatedItems[itemIndex] = updatedItem;
    const updatedPlan: ManualTestPlan = { ...plan, items: updatedItems };

    // Recompute scores
    const manualRollup = rollupManualScore(updatedItems);
    const automatedScore = audit.automatedScore ?? 0;

    // Count how many criteria automation covered (total - manual items)
    const automatedCriteriaCount = 52 - updatedItems.length;
    const combined = combineScores(automatedScore, automatedCriteriaCount, manualRollup);

    // Determine status
    const allEvaluated = manualRollup.counts.untested === 0;
    const status = allEvaluated ? "completed" : "in-progress";

    // Write to DB
    await prisma.auditRequest.update({
      where: { id },
      data: {
        findings: updatedPlan as unknown as object,
        manualScore: manualRollup.score,
        combinedScore: combined.combinedScore,
        status,
        ...(allEvaluated ? { completedAt: new Date() } : {}),
      },
    });

    return NextResponse.json({
      criterion,
      verdict,
      scores: {
        manual: manualRollup.score,
        combined: combined.combinedScore,
        evaluated: manualRollup.evaluated,
        total: manualRollup.counts.total,
      },
      status,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
