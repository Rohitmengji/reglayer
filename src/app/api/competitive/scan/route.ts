/**
 * RegLayer — Competitive Intelligence Scan API
 *
 * POST /api/competitive/scan — Scan a single competitor or all competitors
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { scanCompetitor, scanAllCompetitors } from "@/lib/competitive/service";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const scanSchema = z.object({
  competitorId: z.string().min(1).optional(),
  all: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
  });
  if (!member) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  if (member.role === "VIEWER") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = scanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Scan all competitors
  if (parsed.data.all) {
    const results = await scanAllCompetitors(member.workspaceId);
    return NextResponse.json({ results });
  }

  // Scan single competitor
  if (!parsed.data.competitorId) {
    return NextResponse.json({ error: "competitorId or all=true required" }, { status: 400 });
  }

  // Verify competitor belongs to this workspace
  const competitor = await prisma.competitor.findFirst({
    where: { id: parsed.data.competitorId, workspaceId: member.workspaceId },
  });
  if (!competitor) {
    return NextResponse.json({ error: "Competitor not found" }, { status: 404 });
  }

  try {
    const result = await scanCompetitor(parsed.data.competitorId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
