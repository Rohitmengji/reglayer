/**
 * RegLayer — Competitive Intelligence API
 *
 * GET  /api/competitive — List competitors + benchmark
 * POST /api/competitive — Add a competitor
 * DELETE /api/competitive — Remove a competitor
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import {
  listCompetitors,
  addCompetitor,
  removeCompetitor,
  getBenchmark,
} from "@/lib/competitive/service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const addSchema = z.object({
  url: z.string().url().max(500),
  name: z.string().max(100).optional(),
  industry: z.string().max(50).optional(),
});

const removeSchema = z.object({
  competitorId: z.string().min(1),
});

export async function GET(request: NextRequest) {
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

  const { searchParams } = request.nextUrl;
  const mode = searchParams.get("mode"); // "benchmark" or default "list"
  const siteUrl = searchParams.get("siteUrl") || undefined;

  if (mode === "benchmark") {
    const benchmark = await getBenchmark(member.workspaceId, siteUrl);
    return NextResponse.json(benchmark);
  }

  const competitors = await listCompetitors(member.workspaceId);
  return NextResponse.json({ competitors });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
    include: { workspace: true, user: true },
  });
  if (!member) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Require at least MEMBER role
  if (member.role === "VIEWER") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  // Limit: max 10 competitors per workspace
  const count = await prisma.competitor.count({ where: { workspaceId: member.workspaceId } });
  if (count >= 10) {
    return NextResponse.json(
      { error: "Maximum 10 competitors allowed. Remove one to add another." },
      { status: 400 }
    );
  }

  try {
    const competitor = await addCompetitor(
      member.workspaceId,
      parsed.data.url,
      parsed.data.name,
      parsed.data.industry,
      member.userId
    );
    return NextResponse.json({ competitor }, { status: 201 });
  } catch (err: unknown) {
    // Handle unique constraint (already added)
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "This competitor is already being tracked" }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(request: NextRequest) {
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
  const parsed = removeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  await removeCompetitor(member.workspaceId, parsed.data.competitorId);
  return NextResponse.json({ success: true });
}
