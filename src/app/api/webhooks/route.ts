/**
 * RegLayer — Webhooks API
 *
 * WHY: Users configure webhooks to receive scan events in their systems.
 * WHAT: GET (list webhooks), POST (create with URL + events + secret), DELETE (remove).
 * HOW: Validates URL and events with Zod. Stores webhook config. HMAC secret generated if not provided.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { z } from "zod";
import crypto from "crypto";
import { PLAN_LIMITS, type PlanType } from "@/lib/credits/plan-limits";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { validateScanUrl, resolvesToInternalIp } from "@/lib/validations/ssrf";

const webhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  events: z.array(z.enum([
    "scan.completed",
    "scan.failed",
    "alert.triggered",
    "score.improved",
    "score.degraded",
    "crawl.completed",
  ])).min(1),
  secret: z.string().optional(),
  enabled: z.boolean().default(true),
});

/**
 * Resolve the workspace for the authenticated caller.
 * Webhooks are tenant-scoped, so every operation runs against the
 * caller's workspace membership. Returns null when the user has no
 * membership (treated as "no access" by callers).
 */
async function resolveWorkspaceId(email: string): Promise<string | null> {
  const member = await prisma.workspaceMember.findFirst({
    where: { user: { email } },
  });
  return member?.workspaceId ?? null;
}

/**
 * GET /api/webhooks — List all webhook endpoints
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const workspaceId = await resolveWorkspaceId(session.user.email);
  if (!workspaceId) {
    return NextResponse.json({ webhooks: [], deliveries: [] });
  }

  const hooks = await prisma.webhook.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });

  const webhooks = hooks.map((h) => ({
    id: h.id,
    name: h.name,
    url: h.url,
    events: h.events,
    enabled: h.enabled,
    hasSecret: !!h.secret,
    createdAt: h.createdAt,
  }));

  // Recent deliveries (logged to audit trail, scoped to this workspace)
  const deliveries = await prisma.auditLog.findMany({
    where: { action: "webhook.delivered", workspaceId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const deliveryLog = deliveries.map((d) => {
    const meta = d.metadata as Record<string, unknown>;
    return {
      id: d.id,
      webhookId: meta.webhookId,
      event: meta.event,
      status: meta.status,
      statusCode: meta.statusCode,
      duration: meta.duration,
      timestamp: d.createdAt,
      error: meta.error,
    };
  });

  return NextResponse.json({ webhooks, deliveries: deliveryLog });
}

/**
 * POST /api/webhooks — Register a new webhook endpoint
 */
export async function POST(request: NextRequest) {
  // Auth & plan check
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = await resolveWorkspaceId(session.user.email);
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 403 });
  }

  // Registering a webhook (subscribes to scan events and POSTs data to an external
  // URL) is a privileged integration action — require integrations.manage so a
  // read-only VIEWER/MEMBER can't wire up an exfiltration endpoint.
  const perm = await requireWorkspacePermission("integrations.manage", { workspaceId });
  if (!perm.ok) return perm.response;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { plan: true, isMasterAdmin: true },
  });

  if (!user?.isMasterAdmin) {
    const plan = (user?.plan || "FREE") as PlanType;
    const webhookLimit = PLAN_LIMITS[plan].features.webhooks;
    if (webhookLimit === 0) {
      return NextResponse.json(
        { error: "Webhooks are not available on the Free plan. Upgrade to Pro or Enterprise.", upgradeRequired: true },
        { status: 403 }
      );
    }
    // Check count limit (scoped to this workspace)
    if (webhookLimit !== -1) {
      const existingCount = await prisma.webhook.count({
        where: { workspaceId },
      });
      if (existingCount >= webhookLimit) {
        return NextResponse.json(
          { error: `Webhook limit reached (${webhookLimit} on ${plan} plan). Upgrade for more.`, upgradeRequired: true },
          { status: 429 }
        );
      }
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { name, url, events, secret, enabled } = parsed.data;

  // SSRF protection — webhook targets are fetched server-side, so use the shared
  // hardened validator (covers IPv6 literals, encoded/decimal IPs, etc.) plus a
  // DNS-resolution check (a public hostname resolving to a private IP), on top of
  // the HTTPS-only requirement. The old inline IPv4 regex missed all of those.
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid webhook URL" }, { status: 400 });
  }
  if (parsedUrl.protocol !== "https:") {
    return NextResponse.json({ error: "Webhook URLs must use HTTPS" }, { status: 400 });
  }
  if (validateScanUrl(url) || (await resolvesToInternalIp(url))) {
    return NextResponse.json(
      { error: "Webhook URLs cannot target internal/private addresses" },
      { status: 400 }
    );
  }

  // Generate signing secret if not provided
  const signingSecret = secret || crypto.randomBytes(32).toString("hex");

  const webhook = await prisma.webhook.create({
    data: {
      name,
      url,
      events,
      enabled,
      secret: crypto.createHash("sha256").update(signingSecret).digest("hex"),
      workspaceId,
    },
  });

  return NextResponse.json(
    {
      id: webhook.id,
      name,
      url,
      events,
      enabled,
      signingSecret, // shown only once
    },
    { status: 201 }
  );
}

/**
 * DELETE /api/webhooks?id=xxx — Remove a webhook
 */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = await resolveWorkspaceId(session.user.email);
  if (!workspaceId) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }

  // Deleting integrations is an owner/admin-tier action (integrations.manage),
  // not something a read-only role should be able to do.
  const perm = await requireWorkspacePermission("integrations.manage", { workspaceId });
  if (!perm.ok) return perm.response;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  // Enforce ownership — only delete webhooks belonging to the caller's workspace
  const entry = await prisma.webhook.findFirst({ where: { id, workspaceId } });
  if (!entry) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }

  await prisma.webhook.delete({ where: { id } });

  return NextResponse.json({ deleted: true });
}
