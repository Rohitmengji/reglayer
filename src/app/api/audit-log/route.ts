/**
 * RegLayer — Audit Log API
 *
 * WHY: Compliance requires an immutable record of all actions taken in the workspace.
 * WHAT: GET returns paginated audit log entries with actor, action, target, timestamp.
 * HOW: Queries AuditLog model filtered by workspace and date range. Cannot be modified/deleted.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/prisma";
import { PLAN_LIMITS, type PlanType } from "@/lib/credits/plan-limits";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { z } from "zod";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const summaries: Record<string, string> = {
  "scan.created": "A scan was requested.",
  "scan.completed": "A scan completed. Review its findings in scan history.",
  "scan.failed": "The scan did not complete. Review scan history before trying again.",
  "scan.deleted": "A scan was removed.",
  "member.invited": "A workspace invitation was requested. Delivery must be confirmed separately.",
  "member.removed": "A member was removed from this workspace.",
  "member.role_changed": "A workspace member's role changed.",
  "settings.updated": "Workspace settings were updated.",
  "crawl.started": "A site crawl was requested.",
};

function safeTarget(target: string | null): string | null {
  if (!target) return null;
  if (/^https?:\/\//i.test(target)) {
    try { return new URL(target).origin; } catch { return null; }
  }
  return /^[a-zA-Z0-9_.@+-]{1,160}$/.test(target) ? target : null;
}

/**
 * GET /api/audit-log — Fetch audit log entries
 * Supports pagination via ?page=1&limit=50
 * Respects plan-based retention limits (FREE=7d, PRO=90d, ENTERPRISE=365d)
 */
export async function GET(request: NextRequest) {
  const access = await requireWorkspacePermission("scans.view");
  if (!access.ok) return access.response;
  if (!access.ctx.workspaceId) return NextResponse.json({ error: "Select a workspace to view its activity." }, { status: 403 });
  const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) return NextResponse.json({ error: "Invalid activity page or page size." }, { status: 400 });
  const { page, limit } = query.data;

  try {
    const user = await prisma.user.findUnique({ where: { id: access.ctx.userId }, select: { plan: true } });
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const plan = user.plan as PlanType;
    const retentionDays = access.ctx.isMasterAdmin ? 365 : (PLAN_LIMITS[plan] ?? PLAN_LIMITS.FREE).auditLogDays;
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() - retentionDays);
    const where = { workspaceId: access.ctx.workspaceId, createdAt: { gte: retentionDate } };
    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        select: { id: true, action: true, actor: true, target: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.auditLog.count({ where }),
    ]);
    const logs = entries.map(entry => {
      const action = /^[a-z][a-z0-9]*(?:[._][a-z0-9]+){1,4}$/.test(entry.action) && entry.action.length <= 80 ? entry.action : "activity.recorded";
      return {
        id: entry.id, action, actor: entry.actor, target: safeTarget(entry.target), createdAt: entry.createdAt,
        summary: summaries[action] ?? (/[._]failed$/.test(action)
          ? "The action did not complete. Review its related result or contact your workspace administrator."
          : "Workspace activity was recorded."),
      };
    });
    return NextResponse.json({ logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Activity is temporarily unavailable. Please try again." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
