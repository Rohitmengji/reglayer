/**
 * POST /api/vault/[proofId]/revoke — Revoke a compliance proof
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { revokeProof } from "@/lib/vault/proofEngine";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ proofId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { proofId } = await params;
    const body = await request.json();
    const { reason } = body;

    if (!reason) {
      return NextResponse.json({ error: "Reason is required" }, { status: 400 });
    }

    // Verify admin/owner membership
    const proof = await prisma.complianceProof.findUnique({
      where: { id: proofId },
      select: { workspaceId: true },
    });
    if (!proof) {
      return NextResponse.json({ error: "Proof not found" }, { status: 404 });
    }

    const member = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: proof.workspaceId,
        user: { email: session.user.email },
        role: { in: ["OWNER", "ADMIN"] },
      },
    });
    if (!member) {
      return NextResponse.json({ error: "Only admins can revoke proofs" }, { status: 403 });
    }

    await revokeProof(proofId, reason);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
