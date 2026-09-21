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
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { assertScanAccess } from "@/lib/auth/access";
import { Impact, ViolationStatus } from "@/generated/prisma/client";
import { getFilteredViolations, getStatusSummary } from "@/lib/violations/status";
import { requireFeature } from "@/lib/features/require-feature";

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
    const guard = await requireFeature("violations");
    if (!guard.allowed) return guard.response;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "AUTH_REQUIRED", message: "Authentication required" },
        { status: 401 }
      );
    }

    const { searchParams } = request.nextUrl;
    const scanId = searchParams.get("scanId");
    const statusParam = searchParams.get("status");
    const impacts = searchParams.get("impact")?.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
    if (impacts?.some((value) => !Object.values(Impact).includes(value as Impact))) {
      return NextResponse.json({ error: "INVALID_IMPACT", message: "Choose critical, serious, moderate or minor impact." }, { status: 400 });
    }
    const page = Math.max(1, Math.trunc(Number(searchParams.get("page")) || 1));
    const limit = Math.min(100, Math.max(1, Math.trunc(Number(searchParams.get("limit")) || 25)));

    if (!scanId) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "scanId query parameter is required" },
        { status: 400 }
      );
    }

    // Validate status param if provided. Accepts a single value or a
    // comma-separated list (e.g. the Exceptions tab = WONT_FIX,ACCEPTABLE_RISK).
    let status: ViolationStatus | ViolationStatus[] | undefined;
    if (statusParam) {
      const requested = statusParam.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
      const valid = Object.values(ViolationStatus);
      const invalid = requested.filter((s) => !valid.includes(s as ViolationStatus));
      if (invalid.length > 0) {
        return NextResponse.json(
          {
            error: "INVALID_STATUS",
            message: `Invalid status. Must be one of: ${valid.join(", ")}`,
            field: "status",
          },
          { status: 400 }
        );
      }
      status = requested.length === 1
        ? (requested[0] as ViolationStatus)
        : (requested as ViolationStatus[]);
    }

    const access = await assertScanAccess(scanId, session);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.status === 401 ? "USER_NOT_FOUND" : access.status === 404 ? "SCAN_NOT_FOUND" : "FORBIDDEN", message: access.error },
        { status: access.status }
      );
    }

    // Fetch filtered violations + summary in parallel
    const [result, summary] = await Promise.all([
      getFilteredViolations({ scanId, status, impact: impacts?.length === 1 ? impacts[0] : impacts?.length ? impacts : undefined, page, limit }),
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
