/**
 * RegLayer — Monitors API
 *
 * WHY: Users want to track specific sites for accessibility changes over time.
 * WHAT: GET (list monitored sites), POST (add site to monitor), DELETE (stop monitoring).
 * HOW: Creates Site records linked to workspace. Sites can then have schedules attached.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { z } from "zod";

const alertRuleSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  condition: z.enum(["score_below", "score_drop", "new_critical", "new_violations"]),
  threshold: z.number().min(0).max(100),
  notifyVia: z.enum(["webhook", "email"]).default("webhook"),
  webhookUrl: z.string().url().optional(),
  enabled: z.boolean().default(true),
});

/**
 * GET /api/monitors — List all monitoring rules
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Scope to user's workspace
  const member = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
  });

  if (!member) {
    return NextResponse.json({ monitors: [], recentAlerts: [] });
  }

  const schedules = await prisma.schedule.findMany({
    where: { workspaceId: member.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { site: { select: { url: true, name: true } } },
  });

  // Alert rules (workspace-scoped Monitor records)
  const rules = await prisma.monitor.findMany({
    where: { workspaceId: member.workspaceId },
    orderBy: { createdAt: "desc" },
  });

  // Also get recent alert triggers from audit log (workspace-scoped)
  const recentAlerts = await prisma.auditLog.findMany({
    where: { action: "alert.triggered", workspaceId: member.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ monitors: schedules, rules, recentAlerts });
}

/**\n * POST /api/monitors — Create a monitoring rule\n */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Scope to user's workspace
  const member = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
  });

  if (!member) {
    return NextResponse.json({ error: "No workspace found" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = alertRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { name, url, condition, threshold, notifyVia, webhookUrl, enabled } = parsed.data;

  // Create or find site (scoped to this workspace)
  let site = await prisma.site.findFirst({ where: { url, workspaceId: member.workspaceId } });
  if (!site) {
    site = await prisma.site.create({
      data: { url, name: new URL(url).hostname, workspaceId: member.workspaceId },
    });
  }

  // Create schedule (drives the recurring scans)
  const schedule = await prisma.schedule.create({
    data: {
      name,
      cron: "0 */6 * * *", // every 6 hours by default
      enabled,
      workspaceId: member.workspaceId,
      siteId: site.id,
    },
  });

  // Persist the alert rule as a workspace-scoped Monitor record
  await prisma.monitor.create({
    data: {
      name,
      url,
      condition,
      threshold,
      notifyVia,
      webhookUrl,
      enabled,
      workspaceId: member.workspaceId,
      siteId: site.id,
    },
  });

  return NextResponse.json({ id: schedule.id, name, url, condition, threshold }, { status: 201 });
}
