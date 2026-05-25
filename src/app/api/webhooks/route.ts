import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/prisma";
import { z } from "zod";
import crypto from "crypto";

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
