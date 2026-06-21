/**
 * RegLayer — Violation Fix Verification API
 *
 * WHY: Users mark violations as "fixed" but have no way to confirm the fix works.
 *      This endpoint re-scans the source URL and checks if the specific rule still fails.
 *
 * WHAT:
 *   POST /api/violations/[id]/verify — Re-scan and verify a single violation fix
 *
 * HOW: Uses existing Playwright + axe-core scanner with a 25s timeout.
 *      If the ruleId no longer appears → VERIFIED. If still failing → returns error.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import {
  verifyViolationFix,
  StatusValidationError,
} from "@/lib/violations/status";

/**
 * POST /api/violations/[id]/verify
 *
 * Triggers a minimal re-scan of the violation's source URL.
 * Checks if the specific ruleId still appears in results.
 *
 * @returns { verified: boolean, verifiedAt?: string, stillFailing?: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: violationId } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "AUTH_REQUIRED", message: "Authentication required" },
        { status: 401 }
      );
    }

    if (!violationId) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "Violation ID is required" },
        { status: 400 }
      );
    }

    // Resolve the violation's workspace, then enforce scans.run there — this
    // confirms membership AND blocks read-only VIEWERs (re-scanning to verify a
    // fix is operational work — MEMBER and above).
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

    // Non-disclosure: deny with the SAME 404 as a nonexistent violation so this
    // endpoint can't confirm a foreign violation id exists.
    const perm = await requireWorkspacePermission("scans.run", { workspaceId: wsId });
    if (!perm.ok) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Violation not found" },
        { status: 404 }
      );
    }

    // Run verification
    const result = await verifyViolationFix(violationId);

    // Audit trail on success
    if (result.verified) {
      await prisma.auditLog.create({
        data: {
          action: "violation.verified",
          actor: perm.ctx.userId,
          target: violationId,
          metadata: { verifiedAt: result.verifiedAt },
        },
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof StatusValidationError) {
      return NextResponse.json(
        { error: err.code, message: err.message, field: err.field },
        { status: 404 }
      );
    }
    const message = err instanceof Error ? err.message : "Verification failed";
    return NextResponse.json(
      { error: "VERIFICATION_FAILED", message },
      { status: 500 }
    );
  }
}
