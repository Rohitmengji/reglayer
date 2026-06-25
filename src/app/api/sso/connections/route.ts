/**
 * /api/sso/connections — Enterprise SSO connection management (OWNER/ADMIN).
 *
 *  GET  → list this workspace's connections (+ their domains, non-revealing of others).
 *  POST → create a connection, register it with the Jackson backend, audit it.
 *
 * Gated by requireSsoAdmin (rate-limit + sso.manage + Enterprise `sso`). Every
 * query is scoped to the caller's resolved workspace. New connections start at
 * rolloutStage=DISABLED and have NO verified domains, so they cannot route any
 * login until an admin verifies a domain and promotes the rollout stage.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { getSsoBackend } from "@/lib/sso/backend";
import { recordSsoAudit } from "@/lib/sso/audit";
import { requireSsoAdmin } from "@/lib/sso/admin-guard";
import { parseCertNotAfterFromSamlMetadata } from "@/lib/sso/cert-health";
import { logger } from "@/lib/telemetry/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z
  .object({
    label: z.string().trim().min(1).max(100),
    protocol: z.enum(["SAML", "OIDC"]),
    // SSO never auto-provisions OWNER — restrict the default to non-owner roles.
    defaultRole: z.enum(["ADMIN", "MEMBER", "VIEWER"]).optional(),
    // SAML metadata (one of)
    rawMetadata: z.string().min(1).max(100_000).optional(),
    metadataUrl: z.string().url().optional(),
    // OIDC
    oidcDiscoveryUrl: z.string().url().optional(),
    oidcClientId: z.string().min(1).max(400).optional(),
    oidcClientSecret: z.string().min(1).max(400).optional(),
  })
  .refine((d) => (d.protocol === "SAML" ? !!(d.rawMetadata || d.metadataUrl) : true), {
    message: "SAML connections require rawMetadata or metadataUrl",
  })
  .refine((d) => (d.protocol === "OIDC" ? !!(d.oidcDiscoveryUrl && d.oidcClientId && d.oidcClientSecret) : true), {
    message: "OIDC connections require oidcDiscoveryUrl, oidcClientId and oidcClientSecret",
  });

export async function GET(request: NextRequest) {
  const guard = await requireSsoAdmin(request);
  if (!guard.ok) return guard.response;

  const connections = await prisma.sSOConnection.findMany({
    where: { workspaceId: guard.ctx.workspaceId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      protocol: true,
      defaultRole: true,
      rolloutStage: true,
      enforcementPolicy: true,
      healthStatus: true,
      certificateExpiresAt: true,
      disabledAt: true,
      lastSSOLoginAt: true,
      createdAt: true,
      domains: {
        where: { deletedAt: null },
        select: { id: true, domain: true, verificationStatus: true, isPrimary: true },
      },
    },
  });

  return NextResponse.json({ connections });
}

export async function POST(request: NextRequest) {
  const guard = await requireSsoAdmin(request);
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const input = parsed.data;
  const { workspaceId, userId } = guard.ctx;

  // Parse the IdP signing-cert expiry up front (SAML metadata only) so health
  // monitoring + expiry alerts work without re-fetching from Jackson (#21).
  const certificateExpiresAt =
    input.protocol === "SAML" && input.rawMetadata ? parseCertNotAfterFromSamlMetadata(input.rawMetadata) : null;

  // 1. Create the row first — the Jackson tenant IS the connection id (multi-IdP, #27).
  const connection = await prisma.sSOConnection.create({
    data: {
      workspaceId,
      label: input.label,
      protocol: input.protocol,
      defaultRole: input.defaultRole ?? "MEMBER",
      createdBy: userId,
      ...(certificateExpiresAt ? { certificateExpiresAt } : {}),
      // Public endpoints kept for self-healing health probes (#43).
      ...(input.protocol === "SAML" && input.metadataUrl ? { metadataUrl: input.metadataUrl } : {}),
      ...(input.protocol === "OIDC" && input.oidcDiscoveryUrl ? { oidcDiscoveryUrl: input.oidcDiscoveryUrl } : {}),
    },
    select: { id: true, label: true, protocol: true, rolloutStage: true, defaultRole: true },
  });

  // 2. Register the IdP config with Jackson (the only place secrets/metadata live).
  const callbackUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/auth/callback/boxyhq-saml`;
  const jacksonInput: Record<string, unknown> = {
    tenant: connection.id,
    product: "reglayer",
    name: input.label,
    defaultRedirectUrl: callbackUrl,
    redirectUrl: [callbackUrl],
  };
  if (input.protocol === "OIDC") {
    jacksonInput.protocol = "oidc";
    jacksonInput.oidcDiscoveryUrl = input.oidcDiscoveryUrl;
    jacksonInput.oidcClientId = input.oidcClientId;
    jacksonInput.oidcClientSecret = input.oidcClientSecret;
  } else if (input.rawMetadata) {
    jacksonInput.rawMetadata = input.rawMetadata;
  } else {
    jacksonInput.metadataUrl = input.metadataUrl;
  }

  try {
    const backend = await getSsoBackend();
    await backend.upsertConnection(jacksonInput);
  } catch (err) {
    // Roll back the orphaned row so a failed IdP registration leaves no trace.
    // If even the rollback fails, log it — the row is discoverable via GET, but
    // an operator needs to know it's an orphan from a failed registration.
    await prisma.sSOConnection.delete({ where: { id: connection.id } }).catch((delErr) => {
      logger.error("Failed to roll back orphaned SSO connection after backend failure", {
        connectionId: connection.id,
        workspaceId,
        error: String(delErr),
      });
    });
    logger.error("SSO connection registration failed", { workspaceId, error: String(err) });
    return NextResponse.json({ error: "Failed to register the IdP connection with the SSO backend" }, { status: 502 });
  }

  await recordSsoAudit(prisma, {
    connectionId: connection.id,
    actor: guard.ctx.email,
    changeType: "CREATED",
    after: connection,
  });

  return NextResponse.json({ connection }, { status: 201 });
}
