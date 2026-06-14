/**
 * RegLayer — Webhook Test API
 *
 * WHY: Users need to verify their webhook endpoint is reachable before relying on it.
 * WHAT: POST sends a test payload to the specified webhook URL.
 * HOW: Constructs sample event payload, POSTs to URL with HMAC signature, reports success/failure.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import crypto from "crypto";

/**
 * POST /api/webhooks/test — Send a test payload to a webhook endpoint
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

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

  // Scope to caller's workspace — only test webhooks they own
  const member = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
  });
  if (!member) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }

  // Find webhook config (workspace-scoped)
  const hook = await prisma.webhook.findFirst({
    where: { id: webhookId, workspaceId: member.workspaceId },
  });
  if (!hook) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }

  const url = hook.url;
  const secretHash = hook.secret ?? "";

  // SSRF protection — block internal/private targets and require HTTPS
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "metadata.google.internal" ||
      /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/.test(hostname)
    ) {
      return NextResponse.json(
        { error: "Webhook URLs cannot target internal/private addresses" },
        { status: 400 }
      );
    }
    if (parsed.protocol !== "https:") {
      return NextResponse.json({ error: "Webhook URLs must use HTTPS" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid webhook URL" }, { status: 400 });
  }

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

  // Log delivery (workspace-scoped so GET can filter by tenant)
  await prisma.auditLog.create({
    data: {
      action: "webhook.delivered",
      target: webhookId,
      workspaceId: member.workspaceId,
      metadata: {
        webhookId,
        workspaceId: member.workspaceId,
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
