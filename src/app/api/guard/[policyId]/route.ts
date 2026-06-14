/**
 * PATCH /api/guard/[policyId] — Update a guard policy
 * DELETE /api/guard/[policyId] — Delete a guard policy
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { z } from "zod";

/**
 * Explicit allowlist of fields a PATCH may change. Anything not listed here
 * (siteId, workspaceId, baselineScanId, baselineScore, baselineLockedAt, id,
 * timestamps) is silently dropped — never accepted from the request body — so
 * a caller can't reassign a policy to another site/tenant or forge a baseline
 * via mass-assignment.
 */
const updatePolicySchema = z
  .object({
    name: z.string().min(1).max(200),
    enabled: z.boolean(),
    minScore: z.number().min(0).max(100),
    maxCritical: z.number().int().min(0),
    maxSerious: z.number().int().min(0),
    maxScoreDrop: z.number().min(0).max(100),
    maxNewViolations: z.number().int().min(0),
    autoPromoteBaseline: z.boolean(),
  })
  .partial()
  .strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ policyId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { policyId } = await params;
    const parsed = updatePolicySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const data = parsed.data;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
    }

    const policy = await prisma.guardPolicy.findUnique({
      where: { id: policyId },
      select: { workspaceId: true },
    });
    if (!policy) {
      return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    }

    const member = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: policy.workspaceId,
        user: { email: session.user.email },
        role: { in: ["OWNER", "ADMIN"] },
      },
    });
    if (!member) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const updated = await prisma.guardPolicy.update({
      where: { id: policyId },
      data,
    });

    return NextResponse.json({ policy: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ policyId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { policyId } = await params;

    const policy = await prisma.guardPolicy.findUnique({
      where: { id: policyId },
      select: { workspaceId: true },
    });
    if (!policy) {
      return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    }

    const member = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: policy.workspaceId,
        user: { email: session.user.email },
        role: { in: ["OWNER", "ADMIN"] },
      },
    });
    if (!member) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    await prisma.guardPolicy.delete({ where: { id: policyId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
