/**
 * GET /api/vault — List compliance proofs for workspace
 * POST /api/vault — Issue a new compliance proof from a scan
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { issueProof, listProofs } from "@/lib/vault/proofEngine";
import { assertScanAccess, assertSiteAccess } from "@/lib/auth/access";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import type { ProofType } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const siteId = searchParams.get("siteId") ?? undefined;
    const type = searchParams.get("type") as ProofType | undefined;
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    // Verify membership
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId, user: { email: session.user.email } },
    });
    if (!member) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const result = await listProofs(workspaceId, { siteId, type, limit, offset });
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
    const { siteId, scanId, workspaceId, type, title, description, standard, expiresAt } = body;

    if (!siteId || !scanId || !workspaceId || !type || !title || !standard) {
      return NextResponse.json(
        { error: "Missing required fields: siteId, scanId, workspaceId, type, title, standard" },
        { status: 400 }
      );
    }

    // Authorization — issuing a proof is an operational output from a passing
    // scan, so it requires scans.run (MEMBER and above) in the target workspace.
    // (Revoking a proof, by contrast, stays OWNER/ADMIN.) This also enforces
    // membership: a non-member resolves to no role and is rejected.
    const perm = await requireWorkspacePermission("scans.run", { workspaceId });
    if (!perm.ok) return perm.response;

    // Verify the caller owns the scan being attested, and that the scan is bound
    // to the workspace the proof claims to attest (no cross-tenant proof forgery).
    const scanAccess = await assertScanAccess(scanId, session);
    if (!scanAccess.ok) {
      return NextResponse.json({ error: scanAccess.error }, { status: scanAccess.status });
    }
    if (scanAccess.workspaceId !== workspaceId) {
      return NextResponse.json(
        { error: "Scan does not belong to the specified workspace" },
        { status: 403 }
      );
    }

    // Verify the caller owns the site, and that it belongs to the same workspace.
    const siteAccess = await assertSiteAccess(siteId, session);
    if (!siteAccess.ok) {
      return NextResponse.json({ error: siteAccess.error }, { status: siteAccess.status });
    }
    if (siteAccess.workspaceId !== workspaceId) {
      return NextResponse.json(
        { error: "Site does not belong to the specified workspace" },
        { status: 403 }
      );
    }

    const result = await issueProof({
      siteId,
      scanId,
      workspaceId,
      type,
      title,
      description,
      standard,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
