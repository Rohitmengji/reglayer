/**
 * RegLayer — Integrations API
 *
 * WHY: Users connect external tools (GitHub, Slack) to automate accessibility workflows.
 * WHAT: GET (list connections), POST (connect new), DELETE (disconnect). Stores OAuth tokens securely.
 * HOW: Each integration type has its own handler. OAuth tokens encrypted at rest.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { getOrCreateWorkspace } from "@/lib/database/workspace";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { encryptToken } from "@/lib/crypto";

// Only providers the event dispatcher actually delivers to (lib/integrations/dispatcher.ts).
// linear/gitlab/zapier/email are "coming soon" in the UI and intentionally not
// connectable yet — accepting them would store a config that never fires.
const VALID_PROVIDERS = ["slack", "jira", "github", "teams"];

/**
 * GET /api/integrations — List all integrations for the user's workspace
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.upsert({
    where: { email: session.user.email },
    update: {},
    create: { email: session.user.email, name: (session.user as { name?: string }).name || null },
  });

  const workspaceId = await getOrCreateWorkspace(user.id, user.email);

  const integrations = await prisma.integration.findMany({
    where: { workspaceId },
    orderBy: { connectedAt: "desc" },
  });

  // Strip sensitive tokens from response
  const safe = integrations.map((i) => ({
    id: i.id,
    provider: i.provider,
    name: i.name,
    enabled: i.enabled,
    webhookUrl: i.webhookUrl ? "••••" + i.webhookUrl.slice(-8) : null,
    externalId: i.externalId,
    config: i.config,
    connectedAt: i.connectedAt,
  }));

  return NextResponse.json({ integrations: safe, workspaceId });
}

/**
 * POST /api/integrations — Connect a new integration
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Authorization — connecting external tools (and storing their tokens) is an
  // OWNER/ADMIN capability.
  const perm = await requireWorkspacePermission("integrations.manage");
  if (!perm.ok) return perm.response;

  const user = await prisma.user.upsert({
    where: { email: session.user.email },
    update: {},
    create: { email: session.user.email, name: (session.user as { name?: string }).name || null },
  });

  // Write to the workspace the integrations.manage permission was VERIFIED in —
  // never a separately-resolved one (which could differ for a multi-workspace
  // user and escalate a write into a workspace they don't administer).
  const workspaceId = perm.ctx.workspaceId ?? (await getOrCreateWorkspace(user.id, user.email));
  const body = await request.json();
  const { provider, webhookUrl, config, name } = body;

  if (!provider || !VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  // Validate Slack webhook URL format
  if (provider === "slack" && webhookUrl) {
    if (!webhookUrl.startsWith("https://hooks.slack.com/")) {
      return NextResponse.json({ error: "Invalid Slack webhook URL" }, { status: 400 });
    }
    // Test the webhook
    try {
      const testRes = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "✅ RegLayer connected successfully! You'll receive accessibility scan notifications here." }),
      });
      if (!testRes.ok) {
        return NextResponse.json({ error: "Slack webhook test failed. Check the URL." }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Could not reach Slack webhook URL" }, { status: 400 });
    }
  }

  // Validate Teams webhook URL
  if (provider === "teams" && webhookUrl) {
    if (!webhookUrl.includes("webhook.office.com") && !webhookUrl.includes("microsoft.com")) {
      return NextResponse.json({ error: "Invalid Teams webhook URL" }, { status: 400 });
    }
  }

  // Validate SMTP config
  if (provider === "email" && config) {
    const { host, port, user: smtpUser } = config as Record<string, unknown>;
    if (!host || !port || !smtpUser) {
      return NextResponse.json({ error: "SMTP config requires host, port, and user" }, { status: 400 });
    }
  }

  // Encrypt sensitive tokens before storage
  const encryptedToken = encryptToken(body.accessToken);
  const encryptedRefresh = encryptToken(body.refreshToken);

  // Upsert integration (one per provider per workspace)
  const integration = await prisma.integration.upsert({
    where: { workspaceId_provider: { workspaceId, provider } },
    update: {
      webhookUrl,
      config: config || undefined,
      name: name || provider,
      enabled: true,
      ...(encryptedToken && { accessToken: encryptedToken }),
      ...(encryptedRefresh && { refreshToken: encryptedRefresh }),
      updatedAt: new Date(),
    },
    create: {
      workspaceId,
      userId: user.id,
      provider,
      name: name || provider,
      webhookUrl,
      config: config || undefined,
      ...(encryptedToken && { accessToken: encryptedToken }),
      ...(encryptedRefresh && { refreshToken: encryptedRefresh }),
      enabled: true,
    },
  });

  return NextResponse.json({
    id: integration.id,
    provider: integration.provider,
    name: integration.name,
    enabled: integration.enabled,
    connectedAt: integration.connectedAt,
  });
}

/**
 * PATCH /api/integrations — Update integration (enable/disable, update config)
 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, enabled, config, webhookUrl } = body;

  if (!id) {
    return NextResponse.json({ error: "Integration ID required" }, { status: 400 });
  }

  // Verify the integration exists, then enforce integrations.manage IN ITS
  // workspace — this both checks membership and blocks MEMBER/VIEWER roles.
  const integration = await prisma.integration.findUnique({ where: { id } });
  if (!integration) {
    return NextResponse.json({ error: "Integration not found" }, { status: 404 });
  }

  const perm = await requireWorkspacePermission("integrations.manage", {
    workspaceId: integration.workspaceId,
  });
  if (!perm.ok) return perm.response;

  const updateData: Record<string, unknown> = {};
  if (typeof enabled === "boolean") updateData.enabled = enabled;
  if (config) updateData.config = config;
  if (webhookUrl) updateData.webhookUrl = webhookUrl;

  const updated = await prisma.integration.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({
    id: updated.id,
    provider: updated.provider,
    enabled: updated.enabled,
  });
}

/**
 * DELETE /api/integrations — Disconnect an integration
 */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Integration ID required" }, { status: 400 });
  }

  // Verify the integration exists, then enforce integrations.manage IN ITS
  // workspace — this both checks membership and blocks MEMBER/VIEWER roles.
  const integration = await prisma.integration.findUnique({ where: { id } });
  if (!integration) {
    return NextResponse.json({ error: "Integration not found" }, { status: 404 });
  }

  const perm = await requireWorkspacePermission("integrations.manage", {
    workspaceId: integration.workspaceId,
  });
  if (!perm.ok) return perm.response;

  await prisma.integration.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
