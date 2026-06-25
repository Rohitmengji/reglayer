/**
 * POST /api/sso/connections/[id]/domains — claim a domain for a connection.
 *
 * Returns the DNS TXT record the admin must publish; the domain stays PENDING
 * (does NOT route logins) until /api/sso/domains/[id]/verify confirms ownership.
 * Public/freemail and already-claimed domains are rejected up front via the pure
 * canClaimDomain (review #2/#10); the global VerifiedDomain @@unique is the real
 * race guard, enforced at verify time.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/database/prisma";
import { requireSsoAdmin } from "@/lib/sso/admin-guard";
import { normalizeDomain, expectedTxtRecord } from "@/lib/sso/routing";
import { canClaimDomain } from "@/lib/sso/verified-domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ domain: z.string().trim().min(3).max(253), isPrimary: z.boolean().optional() });

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSsoAdmin(request);
  if (!guard.ok) return guard.response;
  const { id: connectionId } = await ctx.params;
  const { workspaceId } = guard.ctx;

  const connection = await prisma.sSOConnection.findFirst({
    where: { id: connectionId, workspaceId, deletedAt: null },
    select: { id: true },
  });
  if (!connection) return NextResponse.json({ error: "Connection not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const domain = normalizeDomain(parsed.data.domain);
  const existingVerified = await prisma.verifiedDomain.findMany({ where: { domain }, select: { domain: true, workspaceId: true } });
  const claim = canClaimDomain(domain, workspaceId, existingVerified);
  if (!claim.ok) {
    const status = claim.reason === "taken_by_other" ? 409 : 422;
    return NextResponse.json({ error: "Domain cannot be claimed", reason: claim.reason }, { status });
  }

  // Idempotent (best-effort): re-adding a pending domain returns its existing
  // token. SsoDomain has no (connectionId, domain) unique, so two *concurrent*
  // adds can both create a PENDING row — harmless: only one can ever become
  // VERIFIED (VerifiedDomain.@@unique decides at verify time; the loser gets a
  // 409), and both are tombstoned together on connection delete.
  const existing = await prisma.ssoDomain.findFirst({
    where: { connectionId, domain, deletedAt: null },
    select: { id: true, domain: true, verificationStatus: true, verificationToken: true },
  });
  if (existing) {
    return NextResponse.json({
      domain: { id: existing.id, domain: existing.domain, verificationStatus: existing.verificationStatus },
      txtRecord: expectedTxtRecord(existing.verificationToken),
    });
  }

  const token = randomBytes(24).toString("hex");
  const created = await prisma.ssoDomain.create({
    data: {
      connectionId,
      workspaceId,
      domain,
      verificationToken: token,
      verificationMethod: "DNS_TXT",
      isPrimary: parsed.data.isPrimary ?? false,
    },
    select: { id: true, domain: true, verificationStatus: true },
  });

  return NextResponse.json(
    { domain: created, txtRecord: expectedTxtRecord(token), instructions: `Add a DNS TXT record on ${domain} with value: ${expectedTxtRecord(token)}` },
    { status: 201 }
  );
}
