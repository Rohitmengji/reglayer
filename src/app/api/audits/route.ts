/**
 * WHY: Exposes manual test audit lifecycle — create from a scan, list for workspace.
 * WHAT: POST creates a manual-test AuditRequest; GET lists them.
 * HOW: Auth → plan gate → IDOR guard → build plan → persist to findings JSON.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { assertScanAccess } from "@/lib/auth/access";
import { buildTestPlan } from "@/lib/testing/manualTestPlan";
import { mapTagsToWcag } from "@/lib/scanner/accessibility/wcagMapper";
import { hasFeature } from "@/lib/features/feature-access";
import { applyRateLimit } from "@/lib/rate-limit-middleware";
import { z } from "zod";

// ── POST /api/audits — Create a manual-test audit from a scan ─────────────────

const createSchema = z.object({
  scanId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Rate limit
    const rl = await applyRateLimit(request, "api");
    if (rl) return rl;

    // Parse body
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }

    const { scanId } = parsed.data;

    // IDOR guard — verify caller owns the scan
    const access = await assertScanAccess(scanId, session);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    // Feature gate — gated on the scan's WORKSPACE plan via the canonical feature
    // system; master admin bypasses, and admin feature-overrides are honored.
    const featureOk =
      access.isMasterAdmin ||
      (access.workspaceId ? (await hasFeature(access.workspaceId, "manualTesting")).enabled : false);
    if (!featureOk) {
      return NextResponse.json(
        { error: "Manual testing requires a PRO or Enterprise plan", upgradeRequired: true },
        { status: 403 }
      );
    }

    // Load scan data for coverage computation
    const scan = await prisma.scan.findUnique({
      where: { id: scanId },
      select: {
        id: true,
        score: true,
        siteId: true,
        workspaceId: true,
        violations: {
          select: { tags: true },
        },
      },
    });

    if (!scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    // Compute automation coverage from violation tags
    const allTags = scan.violations.flatMap((v) => v.tags);
    const wcagMappings = mapTagsToWcag(allTags);
    const automationCovered = new Set(wcagMappings.map((m) => m.criterion));

    // Build the test plan (no snapshot in v1 API — would require a running browser)
    const testPlan = buildTestPlan(automationCovered, scanId, null);

    // Create AuditRequest with plan in findings
    const auditRequest = await prisma.auditRequest.create({
      data: {
        workspaceId: access.workspaceId ?? "",
        siteId: scan.siteId ?? "",
        type: "manual-test",
        status: "in-progress",
        scope: `Manual testing for scan ${scanId}`,
        findings: testPlan as unknown as object,
        automatedScore: scan.score ?? 0,
        manualScore: 0,
        combinedScore: scan.score ?? 0,
      },
    });

    return NextResponse.json({ id: auditRequest.id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── GET /api/audits — List manual-test audits for workspace ───────────────────

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
      return NextResponse.json({ audits: [] });
    }

    const workspaceIds = user.memberships.map((m) => m.workspaceId);

    const audits = await prisma.auditRequest.findMany({
      where: {
        workspaceId: { in: workspaceIds },
        type: "manual-test",
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        scope: true,
        automatedScore: true,
        manualScore: true,
        combinedScore: true,
        createdAt: true,
        completedAt: true,
      },
    });

    return NextResponse.json({ audits });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
