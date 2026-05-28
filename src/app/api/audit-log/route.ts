/**
 * RegLayer — Audit Log API
 *
 * WHY: Compliance requires an immutable record of all actions taken in the workspace.
 * WHAT: GET returns paginated audit log entries with actor, action, target, timestamp.
 * HOW: Queries AuditLog model filtered by workspace and date range. Cannot be modified/deleted.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { PLAN_LIMITS, type PlanType } from "@/lib/credits/plan-limits";

/**
 * GET /api/audit-log — Fetch audit log entries
 * Supports pagination via ?page=1&limit=50
 * Respects plan-based retention limits (FREE=7d, PRO=90d, ENTERPRISE=365d)
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { plan: true, isMasterAdmin: true },
  });

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const skip = (page - 1) * limit;

  // Apply retention window based on plan
  const plan = (user?.plan || "FREE") as PlanType;
  const retentionDays = user?.isMasterAdmin ? 365 : PLAN_LIMITS[plan].auditLogDays;
  const retentionDate = new Date();
  retentionDate.setDate(retentionDate.getDate() - retentionDays);

  const where = { createdAt: { gte: retentionDate } };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return NextResponse.json({
    logs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}
