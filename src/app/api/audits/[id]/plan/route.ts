/**
 * WHY: Serves the manual test plan with lazily-filled AI guidance.
 * WHAT: GET /api/audits/[id]/plan — returns findings with optional AI enrichment.
 * HOW: Auth → IDOR guard → return plan. Optionally fills AI guidance on demand.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { PLAN_LIMITS, type PlanType } from "@/lib/credits/plan-limits";
import { generateGuidance } from "@/lib/ai/manualTestGuidance";
import type { ManualTestPlan, ManualTestItem } from "@/lib/testing/manualTestPlan";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

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

    // Check if AI guidance enrichment was requested (and not already done)
    const url = new URL(_request.url);
    const enrichAI = url.searchParams.get("enrich") === "true";

    if (enrichAI) {
      // Plan gate already verified above — safe to enrich
      let updated = false;
      const updatedItems: ManualTestItem[] = [];

      for (const item of plan.items) {
        if (!item.aiGenerated && item.verdict === "untested") {
          const result = await generateGuidance(item, user.id);
          if (result.aiGenerated) {
            updatedItems.push({ ...item, guidance: result.guidance, aiGenerated: true });
            updated = true;
          } else {
            updatedItems.push(item);
          }
        } else {
          updatedItems.push(item);
        }
      }

      if (updated) {
        const updatedPlan = { ...plan, items: updatedItems };
        await prisma.auditRequest.update({
          where: { id },
          data: { findings: updatedPlan as unknown as object },
        });
        return NextResponse.json({
          plan: updatedPlan,
          scores: {
            automated: audit.automatedScore,
            manual: audit.manualScore,
            combined: audit.combinedScore,
          },
        });
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
