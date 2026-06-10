/**
 * GET /api/vault/[proofId] — Get single proof with full evidence
 * POST /api/vault/[proofId]/verify — Verify proof integrity
 * POST /api/vault/[proofId]/revoke — Revoke a proof
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { getProof, verifyProof, revokeProof } from "@/lib/vault/proofEngine";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ proofId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { proofId } = await params;
    const proof = await getProof(proofId);

    if (!proof) {
      return NextResponse.json({ error: "Proof not found" }, { status: 404 });
    }

    // Verify membership
    const proofRecord = await prisma.complianceProof.findUnique({
      where: { id: proofId },
      select: { workspaceId: true },
    });
    if (!proofRecord) {
      return NextResponse.json({ error: "Proof not found" }, { status: 404 });
    }

    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId: proofRecord.workspaceId, user: { email: session.user.email } },
    });
    if (!member) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json(proof);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
