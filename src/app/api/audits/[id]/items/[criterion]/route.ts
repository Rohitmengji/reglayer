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
import { hasFeature } from "@/lib/features/feature-access";
import type { ManualTestPlan, ManualVerdict } from "@/lib/testing/manualTestPlan";
import { WCAG_CRITERIA } from "@/lib/wcag/criteria";
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
      select: { id: true, isMasterAdmin: true, memberships: { select: { workspaceId: true } } },
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

    // IDOR guard (master admin has global access)
    const workspaceIds = user.memberships.map((m) => m.workspaceId);
    if (!user.isMasterAdmin && !workspaceIds.includes(audit.workspaceId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Feature gate — canonical feature system; master admin bypasses, overrides honored.
    const featureOk = user.isMasterAdmin || (await hasFeature(audit.workspaceId, "manualTesting")).enabled;
    if (!featureOk) {
      return NextResponse.json(
        { error: "Manual testing requires a PRO or Enterprise plan", upgradeRequired: true },
        { status: 403 }
      );
    }

    if (audit.type !== "manual-test") {
      return NextResponse.json({ error: "Not a manual test audit" }, { status: 400 });
    }

    if (!audit.findings) {
      return NextResponse.json({ error: "No test plan found" }, { status: 404 });
    }

    // The verdict write is a read-modify-write of the whole findings JSON. Two
    // testers (or two tabs) attesting different criteria concurrently would each
    // read the same baseline and the last write would silently clobber the other's
    // verdict — a data-integrity bug on a compliance product. Serialize per-audit
    // by re-reading under a row lock (SELECT ... FOR UPDATE) inside a transaction.
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM audit_requests WHERE id = ${id} FOR UPDATE`;

      const fresh = await tx.auditRequest.findUnique({
        where: { id },
        select: { findings: true, automatedScore: true },
      });
      const plan = fresh?.findings as unknown as ManualTestPlan | null;
      if (!plan || !plan.items) {
        return { ok: false as const, status: 404, error: "No test plan found" };
      }

      const itemIndex = plan.items.findIndex((item) => item.criterion === criterion);
      if (itemIndex === -1) {
        return { ok: false as const, status: 404, error: `Criterion ${criterion} not found in plan` };
      }

      const now = new Date().toISOString();
      const updatedItems = [...plan.items];
      updatedItems[itemIndex] = {
        ...plan.items[itemIndex],
        verdict: verdict as ManualVerdict,
        note: note ?? null,
        attestedBy: user.id,
        attestedAt: now,
      };
      const updatedPlan: ManualTestPlan = { ...plan, items: updatedItems };

      const manualRollup = rollupManualScore(updatedItems);
      const automatedScore = fresh?.automatedScore ?? 0;
      // Prefer the count stored on the plan; fall back to the catalog size for
      // plans created before that field existed (clamped so it can't go negative).
      const automatedCriteriaCount = typeof plan.automatedCriteriaCount === "number"
        ? plan.automatedCriteriaCount
        : Math.max(0, WCAG_CRITERIA.length - updatedItems.length);
      const combined = combineScores(automatedScore, automatedCriteriaCount, manualRollup);

      const allEvaluated = manualRollup.counts.untested === 0;
      const status = allEvaluated ? "completed" : "in-progress";

      await tx.auditRequest.update({
        where: { id },
        data: {
          findings: updatedPlan as unknown as object,
          manualScore: manualRollup.score,
          combinedScore: combined.combinedScore,
          status,
          ...(allEvaluated ? { completedAt: new Date() } : {}),
        },
      });

      return {
        ok: true as const,
        manual: manualRollup.score,
        combined: combined.combinedScore,
        evaluated: manualRollup.evaluated,
        total: manualRollup.counts.total,
        status,
      };
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      criterion,
      verdict,
      scores: {
        manual: result.manual,
        combined: result.combined,
        evaluated: result.evaluated,
        total: result.total,
      },
      status: result.status,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
