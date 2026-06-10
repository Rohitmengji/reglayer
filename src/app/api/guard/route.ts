/**
 * GET /api/guard — List guard policies for workspace
 * POST /api/guard — Create a new guard policy
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { z } from "zod";

const createSchema = z.object({
  siteId: z.string().min(1),
  workspaceId: z.string().min(1),
  name: z.string().min(1).max(100),
  minScore: z.number().min(0).max(100).default(80),
  maxCritical: z.number().int().min(0).default(0),
  maxSerious: z.number().int().min(0).default(3),
  maxScoreDrop: z.number().min(0).max(100).default(5),
  maxNewViolations: z.number().int().min(0).default(5),
  autoPromoteBaseline: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId, user: { email: session.user.email } },
    });
    if (!member) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const policies = await prisma.guardPolicy.findMany({
      where: { workspaceId },
      include: { site: { select: { id: true, url: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ policies });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { workspaceId, siteId, ...rest } = parsed.data;

    // Verify admin membership
    const member = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        user: { email: session.user.email },
        role: { in: ["OWNER", "ADMIN"] },
      },
    });
    if (!member) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Get latest completed scan as initial baseline
    const latestScan = await prisma.scan.findFirst({
      where: { siteId, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: { id: true, score: true },
    });

    const policy = await prisma.guardPolicy.create({
      data: {
        siteId,
        workspaceId,
        ...rest,
        baselineScanId: latestScan?.id ?? null,
        baselineScore: latestScan?.score ?? null,
        baselineLockedAt: latestScan ? new Date() : null,
      },
    });

    return NextResponse.json({ policy }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
