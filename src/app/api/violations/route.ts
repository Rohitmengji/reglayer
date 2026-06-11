/**
 * RegLayer — Violations List API
 *
 * WHY: The violation list page needs server-side filtering, pagination, and status info.
 *      Client-side filtering doesn't scale past 50 violations.
 *
 * WHAT:
 *   GET /api/violations?scanId=xxx&status=OPEN&impact=critical&page=1&limit=25
 *
 * HOW: Delegates to getFilteredViolations() which handles pagination, sorting,
 *      and batch user name lookups. Returns consistent paginated response.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/prisma";
import { ViolationStatus } from "@/generated/prisma/client";
import { getFilteredViolations, getStatusSummary } from "@/lib/violations/status";
import { authenticateRequest } from "@/lib/auth/api-key";

/**
 * GET /api/violations
 *
 * Query params:
 *   scanId (required) — filter by scan
 *   status — filter by ViolationStatus enum value
 *   impact — filter by impact level (critical|serious|moderate|minor)
 *   page — pagination page (default: 1)
 *   limit — results per page (default: 25, max: 100)
 *
 * Response: { violations, summary, total, page, limit, totalPages }
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = request.nextUrl;
    const scanId = searchParams.get("scanId");
    const statusParam = searchParams.get("status");
    const impact = searchParams.get("impact");
    const page = parseInt(searchParams.get("page") ?? "1");
    const limit = parseInt(searchParams.get("limit") ?? "25");

    if (!scanId) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "scanId query parameter is required" },
        { status: 400 }
      );
    }

    // Validate status param if provided
    let status: ViolationStatus | undefined;
    if (statusParam) {
      if (!Object.values(ViolationStatus).includes(statusParam as ViolationStatus)) {
        return NextResponse.json(
          {
            error: "INVALID_STATUS",
            message: `Invalid status. Must be one of: ${Object.values(ViolationStatus).join(", ")}`,
            field: "status",
          },
          { status: 400 }
        );
      }
      status = statusParam as ViolationStatus;
    }

    // Verify scan belongs to user's workspace — the two lookups are
    // independent, so fetch them in parallel
    const [user, scan] = await Promise.all([
      prisma.user.findUnique({
        where: { email: auth.userEmail },
        select: { id: true, memberships: { select: { workspaceId: true } } },
      }),
      prisma.scan.findUnique({
        where: { id: scanId },
        select: { workspaceId: true },
      }),
    ]);

    if (!user) {
      return NextResponse.json(
        { error: "USER_NOT_FOUND", message: "User not found" },
        { status: 401 }
      );
    }

    if (!scan) {
      return NextResponse.json(
        { error: "SCAN_NOT_FOUND", message: "Scan not found" },
        { status: 404 }
      );
    }

    const workspaceIds = user.memberships.map((m) => m.workspaceId);
    if (scan.workspaceId && !workspaceIds.includes(scan.workspaceId)) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "You don't have access to this scan" },
        { status: 403 }
      );
    }

    // Fetch filtered violations + summary in parallel
    const [result, summary] = await Promise.all([
      getFilteredViolations({ scanId, status, impact: impact ?? undefined, page, limit }),
      getStatusSummary(scanId),
    ]);

    return NextResponse.json({
      ...result,
      summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
