/**
 * POST /api/sso/domains/[id]/verify — confirm DNS-TXT ownership of a domain.
 *
 * Resolves the domain's TXT records and checks for `reglayer-verification=<token>`.
 * On success it claims the domain in VerifiedDomain (the global @@unique is the
 * race-safe guarantee — a P2002 means another workspace won the claim → 409) and
 * flips the SsoDomain to VERIFIED, so it can now route SSO logins. On a missing
 * record it returns 200 {verified:false} with the expected record (not an error
 * — the admin just hasn't published it yet).
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveTxt } from "node:dns/promises";
import { prisma } from "@/lib/database/prisma";
import { requireSsoAdmin } from "@/lib/sso/admin-guard";
import { expectedTxtRecord, dnsTxtContainsToken } from "@/lib/sso/routing";
import { canClaimDomain } from "@/lib/sso/verified-domains";
import { recordSsoAudit } from "@/lib/sso/audit";
import { logger } from "@/lib/telemetry/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Thrown inside the verify transaction when the connection was soft-deleted concurrently. */
class ConnectionGone extends Error {}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSsoAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  const { workspaceId } = guard.ctx;

  const domainRow = await prisma.ssoDomain.findFirst({
    where: { id, workspaceId, deletedAt: null, connection: { deletedAt: null } },
    select: { id: true, domain: true, verificationToken: true, verificationStatus: true, connectionId: true },
  });
  if (!domainRow) return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  if (domainRow.verificationStatus === "VERIFIED") return NextResponse.json({ verified: true });

  // Resolve TXT (treat resolution errors as "not found yet", not a 500).
  let records: string[][] = [];
  try {
    records = await resolveTxt(domainRow.domain);
  } catch {
    records = [];
  }
  const flat = records.map((chunks) => chunks.join(""));

  if (!dnsTxtContainsToken(flat, domainRow.verificationToken)) {
    return NextResponse.json({ verified: false, expectedTxtRecord: expectedTxtRecord(domainRow.verificationToken) });
  }

  // Ownership proven — claim it. Re-check against the latest verified set (the
  // @@unique is the real guard; canClaimDomain gives a friendly pre-answer).
  const existingVerified = await prisma.verifiedDomain.findMany({ where: { domain: domainRow.domain }, select: { domain: true, workspaceId: true } });
  const claim = canClaimDomain(domainRow.domain, workspaceId, existingVerified);
  if (!claim.ok) {
    return NextResponse.json({ error: "Domain cannot be claimed", reason: claim.reason }, { status: 409 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Lock the connection row FOR UPDATE so a concurrent soft-delete
      // (DELETE /connections/[id]) can't interleave and leave a VerifiedDomain
      // orphaned on a dead connection (a domain locked-but-unroutable). If it's
      // already gone, abort the whole claim.
      const live = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM sso_connections WHERE id = ${domainRow.connectionId} AND "deletedAt" IS NULL FOR UPDATE`;
      if (live.length === 0) throw new ConnectionGone();

      await tx.verifiedDomain.create({ data: { domain: domainRow.domain, workspaceId, connectionId: domainRow.connectionId } });
      await tx.ssoDomain.update({
        where: { id: domainRow.id },
        data: { verificationStatus: "VERIFIED", verifiedAt: new Date(), verifiedBy: guard.ctx.email, verificationMethod: "DNS_TXT" },
      });
      await recordSsoAudit(tx, {
        connectionId: domainRow.connectionId,
        actor: guard.ctx.email,
        changeType: "DOMAIN_VERIFIED",
        after: { domain: domainRow.domain },
      });
    });
  } catch (err) {
    if (err instanceof ConnectionGone) {
      return NextResponse.json({ error: "Connection no longer active" }, { status: 409 });
    }
    // Lost the race on the global unique → another workspace owns it now.
    if ((err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Domain cannot be claimed", reason: "taken_by_other" }, { status: 409 });
    }
    logger.error("SSO domain verification failed", { domainId: id, error: String(err) });
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }

  return NextResponse.json({ verified: true });
}
