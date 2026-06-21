/**
 * ---------------------------------------------------------
 * RegLayer — Schedules API (Database-Backed)
 * ---------------------------------------------------------
 *
 * CRUD for scan schedules. All schedules are stored in PostgreSQL
 * and executed by the Vercel Cron runner (/api/cron/run-schedules).
 *
 * Endpoints:
 * GET  /api/schedules → List all schedules for workspace
 * POST /api/schedules → Create / Toggle / Delete schedule
 * ---------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { z } from "zod";
import {
  createScheduleInDB,
  toggleScheduleInDB,
  deleteScheduleFromDB,
  listSchedulesForWorkspace,
  validateCronForPlan,
} from "@/lib/scheduling/scheduleService";
import { getOrCreateWorkspace } from "@/lib/database/workspace";
import { prisma } from "@/lib/database/prisma";
import { PLAN_LIMITS, type PlanType } from "@/lib/credits/plan-limits";
import { logger } from "@/lib/telemetry/logger";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";

const createScheduleSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  cron: z.string().min(9).max(100),
});

/**
 * GET /api/schedules — List all schedules for the current workspace.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const workspaceId = await getOrCreateWorkspace(user.id, user.email);
  const schedules = await listSchedulesForWorkspace(workspaceId);

  // Enrich with recent execution results
  const enriched = await Promise.all(
    schedules.map(async (s) => {
      const lastScan = await prisma.scan.findFirst({
        where: { siteId: s.siteId, status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        select: { score: true, totalViolations: true, completedAt: true },
      });

      return {
        ...s,
        lastScore: lastScan?.score ?? null,
        lastViolations: lastScan?.totalViolations ?? null,
        lastScanAt: lastScan?.completedAt ?? null,
      };
    })
  );

  return NextResponse.json({ schedules: enriched });
}

/**
 * POST /api/schedules — Create, toggle, or delete a schedule.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Authorization — managing schedules is an OWNER/ADMIN capability. MEMBERs run
  // scans but don't configure recurring schedules; VIEWERs are read-only.
  const perm = await requireWorkspacePermission("schedules.manage");
  if (!perm.ok) return perm.response;

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Resolve plan from workspace (billing truth) → fallback to user.plan
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    select: { workspace: { select: { plan: true } } },
    orderBy: { joinedAt: "asc" },
  });
  const userPlan = (membership?.workspace?.plan as PlanType) ?? (user.plan as PlanType) ?? "FREE";
  if (!user.isMasterAdmin && !PLAN_LIMITS[userPlan].features.scheduledScans) {
    return NextResponse.json(
      { error: "Scheduled scans are not available on the Free plan. Upgrade to Pro or Enterprise.", upgradeRequired: true },
      { status: 403 }
    );
  }

  // Operate ONLY in the workspace the schedules.manage permission was verified
  // in — using a separately-resolved workspace could let a permission checked in
  // one workspace toggle/delete schedules in another.
  const workspaceId = perm.ctx.workspaceId ?? (await getOrCreateWorkspace(user.id, user.email));

  try {
    const body = await request.json();

    // Toggle schedule
    if (body.action === "toggle" && body.id) {
      const schedule = await toggleScheduleInDB(body.id, workspaceId);
      if (!schedule) {
        return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
      }
      return NextResponse.json({ schedule });
    }

    // Delete schedule (workspace-scoped — a foreign id is a no-op → 404)
    if (body.action === "delete" && body.id) {
      const deleted = await deleteScheduleFromDB(body.id, workspaceId);
      if (!deleted) {
        return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
      }
      return NextResponse.json({ message: "Deleted" });
    }

    // Create new schedule
    const parseResult = createScheduleSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Validate cron against plan limits
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { plan: true },
    });

    const planError = validateCronForPlan(parseResult.data.cron, workspace?.plan || "FREE");
    if (planError) {
      return NextResponse.json({ error: planError }, { status: 403 });
    }

    // Check schedule count limits
    const existingCount = await prisma.schedule.count({ where: { workspaceId } });
    const maxSchedules = workspace?.plan === "ENTERPRISE" ? 50 : workspace?.plan === "PRO" ? 10 : 2;
    if (existingCount >= maxSchedules) {
      return NextResponse.json(
        { error: `Schedule limit reached (${maxSchedules}). Upgrade your plan for more.` },
        { status: 403 }
      );
    }

    const schedule = await createScheduleInDB({
      ...parseResult.data,
      workspaceId,
    });

    return NextResponse.json({ schedule }, { status: 201 });
  } catch (error) {
    logger.error("Failed to process schedule request", {
      service: "schedules-api",
      action: "POST",
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to process schedule request" },
      { status: 500 }
    );
  }
}
