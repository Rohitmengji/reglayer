/**
 * GET /api/testing — List audit requests for workspace
 * POST /api/testing — Create a new audit request
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { createAuditRequest, listAuditRequests, estimateAuditPrice } from "@/lib/testing/humanTestingEngine";
import type { AuditType } from "@/lib/testing/humanTestingEngine";
import { z } from "zod";

const createSchema = z.object({
  workspaceId: z.string().min(1),
  siteId: z.string().min(1),
  type: z.enum(["full-audit", "screen-reader-test", "keyboard-test", "cognitive-review", "usability-test", "vpat-validation"]),
  scope: z.string().min(1).max(2000),
  requirements: z.string().max(5000).default(""),
  urgency: z.enum(["standard", "rush", "critical"]).default("standard"),
  pageCount: z.number().int().min(1).default(10),
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

    const result = await listAuditRequests(workspaceId);
    return NextResponse.json(result);
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

    const { workspaceId, pageCount, ...rest } = parsed.data;

    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId, user: { email: session.user.email } },
    });
    if (!member) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const estimate = estimateAuditPrice(rest.type as AuditType, pageCount, rest.urgency);

    const result = await createAuditRequest({
      workspaceId,
      ...rest,
      budget: estimate.estimate,
    });

    return NextResponse.json({ ...result, estimate }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
