/**
 * PATCH /api/guard/[policyId] — Update a guard policy
 * DELETE /api/guard/[policyId] — Delete a guard policy
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";

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
    const body = await request.json();

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
      data: body,
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
