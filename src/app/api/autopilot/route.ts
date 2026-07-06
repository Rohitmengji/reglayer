/**
 * RegLayer — Compliance Autopilot API
 *
 * GET  /api/autopilot — List autopilot configs for the workspace
 * POST /api/autopilot — Enable autopilot for a site
 * PATCH /api/autopilot — Update autopilot settings
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  siteId: z.string().min(1),
  autoProof: z.boolean().default(true),
  autoRevoke: z.boolean().default(true),
  revokeThreshold: z.number().min(0).max(100).default(70),
  reportEnabled: z.boolean().default(true),
  reportFrequency: z.enum(["weekly", "monthly", "quarterly"]).default("monthly"),
  reportRecipients: z.array(z.string().email()).max(10).default([]),
});

const updateSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean().optional(),
  autoProof: z.boolean().optional(),
  autoRevoke: z.boolean().optional(),
  revokeThreshold: z.number().min(0).max(100).optional(),
  reportEnabled: z.boolean().optional(),
  reportFrequency: z.enum(["weekly", "monthly", "quarterly"]).optional(),
  reportRecipients: z.array(z.string().email()).max(10).optional(),
});

/**
 * GET /api/autopilot — List all autopilot configs for the workspace
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
    include: { workspace: true },
  });
  if (!member) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Pro + Enterprise only
  if (member.workspace.plan === "FREE") {
    return NextResponse.json(
      { error: "Compliance Autopilot requires a Pro or Enterprise plan", upgradeRequired: true },
      { status: 403 }
    );
  }

  const autopilots = await prisma.complianceAutopilot.findMany({
    where: { workspaceId: member.workspace.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ autopilots });
}

/**
 * POST /api/autopilot — Enable autopilot for a site
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
    include: { workspace: true },
  });
  if (!member) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  if (member.workspace.plan === "FREE") {
    return NextResponse.json(
      { error: "Compliance Autopilot requires a Pro or Enterprise plan", upgradeRequired: true },
      { status: 403 }
    );
  }

  if (!["OWNER", "ADMIN"].includes(member.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { siteId, ...config } = parsed.data;

  // Verify site belongs to workspace
  const site = await prisma.site.findFirst({
    where: { id: siteId, workspaceId: member.workspace.id },
  });
  if (!site) {
    return NextResponse.json({ error: "Site not found in workspace" }, { status: 404 });
  }

  // Check not already configured
  const existing = await prisma.complianceAutopilot.findUnique({
    where: { workspaceId_siteId: { workspaceId: member.workspace.id, siteId } },
  });
  if (existing) {
    return NextResponse.json({ error: "Autopilot already configured for this site" }, { status: 409 });
  }

  // Compute first report date
  const nextReportAt = config.reportEnabled
    ? computeNextReport(config.reportFrequency)
    : null;

  const autopilot = await prisma.complianceAutopilot.create({
    data: {
      workspaceId: member.workspace.id,
      siteId,
      ...config,
      nextReportAt,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "autopilot.enabled",
      target: autopilot.id,
      workspaceId: member.workspace.id,
      metadata: { siteId, ...config },
    },
  });

  return NextResponse.json({ autopilot }, { status: 201 });
}

/**
 * PATCH /api/autopilot — Update autopilot settings
 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
    include: { workspace: true },
  });
  if (!member || !["OWNER", "ADMIN"].includes(member.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { id, ...updates } = parsed.data;

  // IDOR check
  const existing = await prisma.complianceAutopilot.findFirst({
    where: { id, workspaceId: member.workspace.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Autopilot config not found" }, { status: 404 });
  }

  // Recompute next report if frequency changed
  let nextReportAt = existing.nextReportAt;
  if (updates.reportFrequency && updates.reportFrequency !== existing.reportFrequency) {
    nextReportAt = computeNextReport(updates.reportFrequency);
  }
  if (updates.reportEnabled === false) {
    nextReportAt = null;
  }

  const autopilot = await prisma.complianceAutopilot.update({
    where: { id },
    data: { ...updates, nextReportAt },
  });

  return NextResponse.json({ autopilot });
}

function computeNextReport(frequency: string): Date {
  const now = new Date();
  switch (frequency) {
    case "weekly": return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "quarterly": return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    default: return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  }
}
