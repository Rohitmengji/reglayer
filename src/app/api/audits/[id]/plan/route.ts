/**
 * WHY: Serves the manual test plan with lazily-filled AI guidance.
 * WHAT: GET /api/audits/[id]/plan — returns findings with optional AI enrichment.
 * HOW: Auth → IDOR guard → return plan. Optionally fills AI guidance on demand.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { applyRateLimit } from "@/lib/rate-limit-middleware";
import { PLAN_LIMITS, type PlanType } from "@/lib/credits/plan-limits";
import { generateGuidance } from "@/lib/ai/manualTestGuidance";
import type { ManualTestPlan } from "@/lib/testing/manualTestPlan";

/** Cap AI-guidance generation per request: bounds credit spend AND keeps the
 *  serverless function well under its time budget (each call hits OpenAI). The
 *  plan is pre-sorted by litigation risk, so the highest-priority criteria are
 *  enriched first; repeat loads enrich the next batch until all are done. */
const MAX_ENRICH_PER_REQUEST = 8;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Enrichment generates AI guidance (spends credits + calls OpenAI), so this
    // GET is a sensitive, side-effecting read — rate-limit it like a mutation.
    const rl = await applyRateLimit(request, "api");
    if (rl) return rl;

    const { id } = await params;

    // Load user and audit request
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, memberships: { select: { workspaceId: true } } },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    const audit = await prisma.auditRequest.findUnique({
      where: { id },
      select: {
        id: true,
        workspaceId: true,
        type: true,
        status: true,
        findings: true,
        automatedScore: true,
        manualScore: true,
        combinedScore: true,
      },
    });

    if (!audit) {
      return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }

    // IDOR guard — verify workspace membership
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
      return NextResponse.json({ error: "No test plan generated" }, { status: 404 });
    }

    // AI-guidance enrichment (opt-in via ?enrich=true). Makes "AI-Guided" real:
    // the UI requests it on plan load, and the AI drafts richer per-criterion
    // guidance. Idempotent — only un-enriched, untested items are processed, so
    // once an item is AI-enriched it's never re-charged on later loads.
    const enrichAI = request.nextUrl.searchParams.get("enrich") === "true";

    if (enrichAI) {
      // Highest-priority un-enriched items first (plan is pre-sorted by risk),
      // capped per request — see MAX_ENRICH_PER_REQUEST.
      const toEnrich = plan.items
        .filter((it) => !it.aiGenerated && it.verdict === "untested")
        .slice(0, MAX_ENRICH_PER_REQUEST);

      if (toEnrich.length > 0) {
        // Generate guidance OUTSIDE any transaction — these are slow OpenAI calls
        // and must never hold a DB row lock.
        const enriched = new Map<string, string>();
        for (const item of toEnrich) {
          const result = await generateGuidance(item, user.id);
          if (result.aiGenerated) enriched.set(item.criterion, result.guidance);
        }

        if (enriched.size > 0) {
          // Persist under a row lock, merging ONLY guidance+aiGenerated into the
          // freshly-read items — so a verdict written concurrently (PATCH) or a
          // concurrent enrich is never clobbered; already-enriched items stay put.
          const mergedPlan = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM audit_requests WHERE id = ${id} FOR UPDATE`;
            const fresh = await tx.auditRequest.findUnique({
              where: { id },
              select: { findings: true },
            });
            const freshPlan = fresh?.findings as unknown as ManualTestPlan | null;
            if (!freshPlan?.items) return null;
            const items = freshPlan.items.map((it) =>
              enriched.has(it.criterion) && !it.aiGenerated
                ? { ...it, guidance: enriched.get(it.criterion) as string, aiGenerated: true }
                : it
            );
            const updatedPlan = { ...freshPlan, items };
            await tx.auditRequest.update({
              where: { id },
              data: { findings: updatedPlan as unknown as object },
            });
            return updatedPlan;
          });

          if (mergedPlan) {
            return NextResponse.json({
              plan: mergedPlan,
              scores: {
                automated: audit.automatedScore,
                manual: audit.manualScore,
                combined: audit.combinedScore,
              },
            });
          }
        }
      }
    }

    return NextResponse.json({
      plan,
      scores: {
        automated: audit.automatedScore,
        manual: audit.manualScore,
        combined: audit.combinedScore,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
