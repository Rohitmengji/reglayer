/**
 * RegLayer — Violation Status API
 *
 * WHY: Teams need to track violation remediation progress like Sentry issues.
 *      Without status tracking, violations are a permanent wall of red.
 *
 * WHAT:
 *   PATCH /api/violations/status — Update a violation's workflow status
 *   GET /api/violations/status?scanId=xxx — Get status summary counts
 *
 * HOW: Delegates to /lib/violations/status.ts business logic. Validates with Zod.
 *      Records audit trail. Enforces workspace ownership.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { assertScanAccess } from "@/lib/auth/access";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { prisma } from "@/lib/database/prisma";
import { ViolationStatus } from "@/generated/prisma/client";
import { z } from "zod";
import {
  updateViolationStatus,
  getStatusSummary,
  StatusValidationError,
} from "@/lib/violations/status";

const patchSchema = z.object({
  violationId: z.string().min(1, "violationId is required"),
  status: z.nativeEnum(ViolationStatus),
  note: z.string().max(500).optional(),
});

/**
 * GET /api/violations/status?scanId=xxx
 * Returns status summary counts for a scan.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "AUTH_REQUIRED", message: "Authentication required" },
        { status: 401 }
      );
    }

    const scanId = request.nextUrl.searchParams.get("scanId");
    if (!scanId) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "scanId query parameter is required" },
        { status: 400 }
      );
    }

    // IDOR guard: only the scan's owner/workspace may read its status summary.
    const access = await assertScanAccess(scanId, session);
    if (!access.ok) {
      return NextResponse.json({ error: "FORBIDDEN", message: access.error }, { status: access.status });
    }

    const summary = await getStatusSummary(scanId);
    return NextResponse.json({ scanId, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/violations/status
 * Update a violation's remediation status.
 *
 * Body: { violationId, status, note? }
 * - note is required (min 10 chars) for WONT_FIX and ACCEPTABLE_RISK
 * - Returns 403 if violation's workspace doesn't match user's membership
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "AUTH_REQUIRED", message: "Authentication required" },
        { status: 401 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "INVALID_JSON", message: "Request body must be valid JSON" },
        { status: 400 }
      );
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const firstField = Object.keys(fieldErrors)[0];
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Invalid request body",
          field: firstField,
          details: fieldErrors,
        },
        { status: 400 }
      );
    }

    const { violationId, status, note } = parsed.data;

    // Resolve the violation's workspace, then enforce scans.run there. This both
    // confirms membership AND blocks read-only VIEWERs from changing remediation
    // status (triage is operational work — MEMBER and above).
    const violation = await prisma.violation.findUnique({
      where: { id: violationId },
      select: { scan: { select: { workspaceId: true } } },
    });
    const wsId = violation?.scan?.workspaceId;
    if (!wsId) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Violation not found" },
        { status: 404 }
      );
    }

    const perm = await requireWorkspacePermission("scans.run", { workspaceId: wsId });
    if (!perm.ok) return perm.response;

    // Delegate to business logic
    const result = await updateViolationStatus({
      violationId,
      status,
      note,
      userId: perm.ctx.userId,
    });

    // Audit trail
    await prisma.auditLog.create({
      data: {
        action: "violation.status_updated",
        actor: user.id,
        target: violationId,
        metadata: { status, note: note ?? null, previousStatus: result.previousStatus },
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof StatusValidationError) {
      return NextResponse.json(
        { error: err.code, message: err.message, field: err.field },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
