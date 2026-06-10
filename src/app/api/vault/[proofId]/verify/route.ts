/**
 * POST /api/vault/[proofId]/verify — Verify proof integrity (public endpoint)
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyProof } from "@/lib/vault/proofEngine";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ proofId: string }> }
) {
  try {
    const { proofId } = await params;
    const result = await verifyProof(proofId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: err instanceof Error && err.message === "Proof not found" ? 404 : 500 }
    );
  }
}
