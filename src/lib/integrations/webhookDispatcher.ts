/**
 * ---------------------------------------------------------
 * RegLayer — Webhook Dispatcher
 * ---------------------------------------------------------
 *
 * Dispatches events to all registered webhook endpoints.
 * Called by scan service, crawl service, and alert engine.
 * ---------------------------------------------------------
 */

import { prisma } from "@/lib/database/prisma";
import crypto from "crypto";

export type WebhookEvent =
  | "scan.completed"
  | "scan.failed"
  | "alert.triggered"
  | "score.improved"
  | "score.degraded"
  | "crawl.completed";

interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Dispatch an event to all webhooks subscribed to it.
 * Non-blocking — fires and logs results.
 */
export async function dispatchWebhookEvent(
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  const hooks = await prisma.auditLog.findMany({
    where: { action: "webhook.registered" },
  });

  const subscribedHooks = hooks.filter((h) => {
    const meta = h.metadata as Record<string, unknown>;
    const events = meta.events as string[];
    return meta.enabled !== false && events.includes(event);
  });

  if (subscribedHooks.length === 0) return;

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const payloadStr = JSON.stringify(payload);

  await Promise.allSettled(
    subscribedHooks.map(async (hook) => {
      const meta = hook.metadata as Record<string, unknown>;
      const url = meta.url as string;
      const secretHash = (meta.secret as string) || "";

      const signature = crypto
        .createHmac("sha256", secretHash)
        .update(payloadStr)
        .digest("hex");

      const deliveryId = crypto.randomUUID();
      const start = Date.now();
      let status: "success" | "failed" = "failed";
      let statusCode = 0;
      let error: string | undefined;

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-RegLayer-Event": event,
            "X-RegLayer-Signature": `sha256=${signature}`,
            "X-RegLayer-Delivery": deliveryId,
          },
          body: payloadStr,
          signal: AbortSignal.timeout(10000),
        });

        statusCode = res.status;
        status = res.ok ? "success" : "failed";
        if (!res.ok) {
          error = `HTTP ${res.status}`;
        }
      } catch (err) {
        error = err instanceof Error ? err.message : "Request failed";
      }

      const duration = Date.now() - start;

      // Log delivery
      await prisma.auditLog.create({
        data: {
          action: "webhook.delivered",
          target: hook.id,
          metadata: {
            webhookId: hook.id,
            event,
            status,
            statusCode,
            duration,
            error,
            url,
            deliveryId,
          },
        },
      }).catch(() => {/* non-critical */});
    })
  );
}
