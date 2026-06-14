/**
 * /api/vault/[proofId]/verify — Independent proof verification.
 *
 * GET is PUBLIC (no auth) so any third party can verify a proof's tamper-evidence
 * from the proof data alone. It returns ONLY non-sensitive integrity fields — never
 * the full evidence payload, scan URL, or violation details.
 *
 * POST is kept for backward compatibility and returns the same public report.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyProof } from "@/lib/vault/proofEngine";

// Integrity verification reads live DB state; never serve a cached/static response.
export const dynamic = "force-dynamic";

async function buildReport(proofId: string) {
  const result = await verifyProof(proofId);
  // Whitelist only non-sensitive fields for public consumption.
  return {
    proofId,
    valid: result.valid,
    hashValid: result.hashValid,
    chainValid: result.chainValid,
    chainIndex: result.chainIndex,
    chainLength: result.chainLength,
    issuedAt: result.issuedAt,
    revokedAt: result.revokedAt,
    expiresAt: result.expiresAt,
    standard: result.standard,
    title: result.title,
    hash: result.hash,
    issues: result.issues,
  };
}

function errorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : "Internal error";
  return NextResponse.json(
    { error: message },
    { status: message === "Proof not found" ? 404 : 500 }
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ proofId: string }> }
) {
  try {
    const { proofId } = await params;
    return NextResponse.json(await buildReport(proofId));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ proofId: string }> }
) {
  try {
    const { proofId } = await params;
    return NextResponse.json(await buildReport(proofId));
  } catch (err) {
    return errorResponse(err);
  }
}
