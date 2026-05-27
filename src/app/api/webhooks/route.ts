import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { z } from "zod";
import crypto from "crypto";
import { PLAN_LIMITS, type PlanType } from "@/lib/credits/plan-limits";

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
 * GET /api/webhooks — List all webhook endpoints
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const hooks = await prisma.auditLog.findMany({
    where: { action: "webhook.registered" },
    orderBy: { createdAt: "desc" },
  });

  const webhooks = hooks.map((h) => {
    const meta = h.metadata as Record<string, unknown>;
    return {
      id: h.id,
      name: meta.name,
      url: meta.url,
      events: meta.events,
      enabled: meta.enabled !== false,
      hasSecret: !!meta.secret,
      createdAt: h.createdAt,
    };
  });

  // Recent deliveries
  const deliveries = await prisma.auditLog.findMany({
    where: { action: "webhook.delivered" },
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
    // Check count limit
    if (webhookLimit !== -1) {
      const existingCount = await prisma.auditLog.count({
        where: { action: "webhook.registered" },
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

  // Generate signing secret if not provided
  const signingSecret = secret || crypto.randomBytes(32).toString("hex");

  const log = await prisma.auditLog.create({
    data: {
      action: "webhook.registered",
      target: url,
      metadata: {
        name,
        url,
        events,
        enabled,
        secret: crypto.createHash("sha256").update(signingSecret).digest("hex"),
      },
    },
  });

  return NextResponse.json(
    {
      id: log.id,
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
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  await prisma.auditLog.delete({ where: { id } }).catch(() => null);

  return NextResponse.json({ deleted: true });
}
