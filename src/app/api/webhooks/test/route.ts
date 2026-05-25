import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/prisma";
import crypto from "crypto";

/**
 * POST /api/webhooks/test — Send a test payload to a webhook endpoint
 */
export async function POST(request: NextRequest) {
  let body: { webhookId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { webhookId } = body;
  if (!webhookId) {
    return NextResponse.json({ error: "Missing webhookId" }, { status: 400 });
  }

  // Find webhook config
  const hook = await prisma.auditLog.findUnique({ where: { id: webhookId } });
  if (!hook || hook.action !== "webhook.registered") {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }

  const meta = hook.metadata as Record<string, unknown>;
  const url = meta.url as string;
  const secretHash = meta.secret as string;

  const testPayload = {
    event: "test",
    timestamp: new Date().toISOString(),
    data: {
      message: "This is a test delivery from RegLayer",
      scanId: "test-scan-id",
      url: "https://example.com",
      score: 85,
    },
  };

  const payloadStr = JSON.stringify(testPayload);
  // Sign with HMAC-SHA256 using the stored hash as key (same approach webhook consumers use)
  const signature = crypto
    .createHmac("sha256", secretHash)
    .update(payloadStr)
    .digest("hex");

  const start = Date.now();
  let status: "success" | "failed" = "failed";
  let statusCode = 0;
  let error: string | undefined;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RegLayer-Signature": `sha256=${signature}`,
        "X-RegLayer-Event": "test",
        "X-RegLayer-Delivery": crypto.randomUUID(),
      },
      body: payloadStr,
      signal: AbortSignal.timeout(10000),
    });

    statusCode = res.status;
    status = res.ok ? "success" : "failed";
    if (!res.ok) {
      error = `HTTP ${res.status}: ${res.statusText}`;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : "Request failed";
  }

  const duration = Date.now() - start;

  // Log delivery
  await prisma.auditLog.create({
    data: {
      action: "webhook.delivered",
      target: webhookId,
      metadata: {
        webhookId,
        event: "test",
        status,
        statusCode,
        duration,
        error,
        url,
      },
    },
  });

  return NextResponse.json({ status, statusCode, duration, error });
}
