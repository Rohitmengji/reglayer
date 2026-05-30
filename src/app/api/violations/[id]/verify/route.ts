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
import {
  verifyViolationFix,
  userOwnsViolation,
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

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "USER_NOT_FOUND", message: "User not found" },
        { status: 401 }
      );
    }

    // Workspace ownership check
    const hasAccess = await userOwnsViolation(violationId, user.id);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "You don't have access to this violation" },
        { status: 403 }
      );
    }

    // Run verification
    const result = await verifyViolationFix(violationId);

    // Audit trail on success
    if (result.verified) {
      await prisma.auditLog.create({
        data: {
          action: "violation.verified",
          actor: user.id,
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
