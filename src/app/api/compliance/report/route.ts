/**
 * WHY: Users need to generate multi-jurisdiction compliance reports from their scans.
 * WHAT: POST creates a report, GET lists reports for the workspace.
 * HOW: Auth → plan gate → load scan violations → run evaluator → persist as JSON.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { requireFeature } from "@/lib/features/require-feature";
import { prisma } from "@/lib/database/prisma";
import { assertScanAccess } from "@/lib/auth/access";
import { applyRateLimit } from "@/lib/rate-limit-middleware";
import { evaluate, type EvaluatorInput } from "@/lib/compliance/evaluator";
import { JURISDICTION_IDS, type JurisdictionId } from "@/lib/compliance/jurisdictions";
import { z } from "zod";

const createSchema = z.object({
  scanId: z.string().min(1),
  jurisdictions: z.array(z.enum(["ADA", "EAA", "SECTION508", "AODA"])).min(1).max(4).default(["ADA", "EAA", "SECTION508", "AODA"]),
});

export async function POST(request: NextRequest) {
  try {
    // Server gate so the multi-jurisdiction report (PRO+ "compliance" feature)
    // can't be generated via the API past the client-side FeatureGate.
    const guard = await requireFeature("compliance");
    if (!guard.allowed) return guard.response;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const rl = await applyRateLimit(request, "api");
    if (rl) return rl;

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }

    const { scanId, jurisdictions } = parsed.data;

    // IDOR guard
    const access = await assertScanAccess(scanId, session);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    // Load scan with violations
    const scan = await prisma.scan.findUnique({
      where: { id: scanId },
      select: {
        id: true,
        score: true,
        siteId: true,
        workspaceId: true,
        url: true,
        violations: {
          select: { ruleId: true, wcagCriteria: true, tags: true, impact: true },
        },
      },
    });

    if (!scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    // Load manual verdicts if any exist for this site
    const manualAudit = await prisma.auditRequest.findFirst({
      where: {
        workspaceId: access.workspaceId ?? "",
        siteId: scan.siteId ?? "",
        type: "manual-test",
        status: { in: ["in-progress", "completed"] },
      },
      orderBy: { createdAt: "desc" },
      select: { findings: true },
    });

    const manualVerdicts: EvaluatorInput["manualVerdicts"] = [];
    if (manualAudit?.findings) {
      const findings = manualAudit.findings as { items?: Array<{ criterion: string; verdict: string }> };
      if (findings.items) {
        for (const item of findings.items) {
          if (item.verdict === "pass" || item.verdict === "fail" || item.verdict === "na") {
            manualVerdicts.push({ criterion: item.criterion, verdict: item.verdict });
          }
        }
      }
    }

    // Run evaluation
    const evaluatorInput: EvaluatorInput = {
      violations: scan.violations.map((v) => ({
        ruleId: v.ruleId,
        wcagCriteria: v.wcagCriteria,
        tags: v.tags,
        impact: v.impact as "critical" | "serious" | "moderate" | "minor",
      })),
      manualVerdicts,
      jurisdictions: jurisdictions as JurisdictionId[],
    };

    const evaluation = evaluate(evaluatorInput);

    // v1: Return evaluation directly without persisting (ComplianceReport model pending)
    // The client can re-generate as needed. v2 will persist to ComplianceReport table.
    return NextResponse.json({
      id: `cr_${Date.now()}`,
      scanId: scan.id,
      evaluation,
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    // Don't expose if it's a Prisma error about missing table
    if (message.includes("does not exist") || message.includes("ComplianceReport")) {
      return NextResponse.json({ error: "Compliance reports are not yet configured. Please contact support." }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { memberships: { select: { workspaceId: true } } },
    });

    if (!user || user.memberships.length === 0) {
      return NextResponse.json({ reports: [] });
    }

    const workspaceIds = user.memberships.map((m) => m.workspaceId);

    // ComplianceReport model pending — return empty for now
    // v2 will persist and list reports from DB
    return NextResponse.json({ reports: [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
