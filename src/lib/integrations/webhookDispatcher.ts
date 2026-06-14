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
import { withRetry } from "@/lib/retry";
import type { Prisma } from "@/generated/prisma/client";
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

/** Outcome of a single webhook delivery attempt (after retries). */
interface DeliveryOutcome {
  status: "success" | "failed";
  statusCode: number;
  error?: string;
}

/**
 * Hostnames/IP ranges that must never be targeted (SSRF protection).
 * Returns true if the URL is safe to call, false if it should be skipped.
 */
function isWebhookUrlAllowed(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "metadata.google.internal" ||
      /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/.test(hostname)
    ) {
      return false; // internal/private — skip
    }
    return true;
  } catch {
    return false; // invalid URL — skip
  }
}

/**
 * Deliver a single signed payload to one webhook URL with retries (R-4).
 *
 * Preserves the SSRF guard, HMAC signing, per-attempt AbortSignal.timeout.
 * withRetry only retries when the thrown error is classified retryable, so a
 * non-ok response is thrown (with the status in the message) to be eligible for
 * retry (5xx/429/network → retry; 4xx → terminal).
 *
 * Returns the outcome rather than throwing; callers decide how to log/DLQ it.
 */
async function deliverToHook(params: {
  url: string;
  secret: string | null;
  event: WebhookEvent;
  payloadStr: string;
  deliveryId: string;
}): Promise<DeliveryOutcome> {
  const { url, secret, event, payloadStr, deliveryId } = params;

  if (!isWebhookUrlAllowed(url)) {
    return { status: "failed", statusCode: 0, error: "URL not allowed (SSRF guard)" };
  }

  // Note: HMAC key is SHA256(original_secret). Receivers verify with:
  // HMAC-SHA256(SHA256(signing_secret), payload_body)
  const signature = crypto
    .createHmac("sha256", secret || "")
    .update(payloadStr)
    .digest("hex");

  try {
    const statusCode = await withRetry(async () => {
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

      if (!res.ok) {
        // Throw so withRetry can classify (5xx/429 → retry, 4xx → terminal).
        throw new Error(`HTTP ${res.status}`);
      }
      return res.status;
    }, { maxAttempts: 3 });

    return { status: "success", statusCode };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Request failed";
    // Recover the status code from "HTTP <code>" messages for the audit log.
    const match = /HTTP (\d{3})/.exec(error);
    return { status: "failed", statusCode: match ? Number(match[1]) : 0, error };
  }
}

/**
 * Dispatch an event to all webhooks subscribed to it.
 * Non-blocking — fires and logs results.
 *
 * Tenant-scoped: only webhooks belonging to `workspaceId` receive the event.
 * When no workspace is provided, dispatch is a no-op to prevent cross-tenant leaks.
 */
export async function dispatchWebhookEvent(
  event: WebhookEvent,
  data: Record<string, unknown>,
  workspaceId: string | null
): Promise<void> {
  if (!workspaceId) return;

  const hooks = await prisma.webhook.findMany({
    where: { workspaceId, enabled: true },
  });

  const subscribedHooks = hooks.filter((h) => h.events.includes(event));

  if (subscribedHooks.length === 0) return;

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const payloadStr = JSON.stringify(payload);

  await Promise.allSettled(
    subscribedHooks.map(async (hook) => {
      const deliveryId = crypto.randomUUID();
      const start = Date.now();

      const outcome = await deliverToHook({
        url: hook.url,
        secret: hook.secret,
        event,
        payloadStr,
        deliveryId,
      });

      const duration = Date.now() - start;

      // Log delivery (workspace-scoped so GET can filter by tenant)
      await prisma.auditLog.create({
        data: {
          action: "webhook.delivered",
          target: hook.id,
          workspaceId,
          metadata: {
            webhookId: hook.id,
            workspaceId,
            event,
            status: outcome.status,
            statusCode: outcome.statusCode,
            duration,
            error: outcome.error,
            url: hook.url,
            deliveryId,
          },
        },
      }).catch(() => {/* non-critical */});

      // R-4: on terminal failure after retries, record a DLQ-style row the cron
      // redelivery sweep can later pick up and re-dispatch. Written IN ADDITION
      // to the webhook.delivered log above. The original payload `data` is stored
      // so the sweep can replay the exact event faithfully.
      if (outcome.status === "failed") {
        await prisma.auditLog.create({
          data: {
            action: "webhook.failed",
            target: hook.id,
            workspaceId,
            metadata: {
              webhookId: hook.id,
              workspaceId,
              event,
              url: hook.url,
              error: outcome.error,
              statusCode: outcome.statusCode,
              deliveryId,
              // Stored so the redelivery sweep can replay the exact event.
              // Cast to Prisma's JSON input type (values are arbitrary but
              // JSON-serializable since the same object is JSON.stringified above).
              data: data as Prisma.InputJsonValue,
            },
          },
        }).catch(() => {/* non-critical */});
      }
    })
  );
}

/**
 * Redelivery sweep for failed webhook deliveries (R-4 DLQ drain).
 *
 * Finds recent `webhook.failed` rows (default: last ~1h, capped) and replays each
 * to its specific hook using the stored event + original payload. Best-effort:
 * - On successful redelivery the failed row is deleted (handled).
 * - On repeated failure the failed row is deleted and a `webhook.redelivered`
 *   row (status: failed) is written so it isn't swept forever; operators can
 *   inspect the audit trail. Either way the DLQ doesn't grow unbounded.
 *
 * Intended to be called from the cron route within remaining budget, wrapped in
 * try/catch. Returns a small summary for logging.
 *
 * @param limit       Max failed rows to process this sweep (default 25).
 * @param sinceMs     Look-back window in ms (default 1h).
 */
export async function redeliverFailedWebhooks(
  limit = 25,
  sinceMs = 60 * 60 * 1000,
): Promise<{ attempted: number; redelivered: number; stillFailing: number }> {
  const since = new Date(Date.now() - sinceMs);

  const failedRows = await prisma.auditLog.findMany({
    where: { action: "webhook.failed", createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let redelivered = 0;
  let stillFailing = 0;

  for (const row of failedRows) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const url = typeof meta.url === "string" ? meta.url : undefined;
    const event = typeof meta.event === "string" ? (meta.event as WebhookEvent) : undefined;
    const webhookId = typeof meta.webhookId === "string" ? meta.webhookId : undefined;
    const data = (meta.data && typeof meta.data === "object" ? meta.data : {}) as Record<string, unknown>;

    if (!url || !event) {
      // Malformed row — drop it so the sweep doesn't keep reprocessing it.
      await prisma.auditLog.delete({ where: { id: row.id } }).catch(() => {});
      continue;
    }

    // Re-sign with the hook's current secret if it still exists.
    const hook = webhookId
      ? await prisma.webhook.findUnique({ where: { id: webhookId } })
      : null;

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };
    const payloadStr = JSON.stringify(payload);

    const outcome = await deliverToHook({
      url,
      secret: hook?.secret ?? null,
      event,
      payloadStr,
      deliveryId: crypto.randomUUID(),
    });

    if (outcome.status === "success") {
      redelivered++;
      // Mark handled: remove the DLQ row and note the successful redelivery.
      await prisma.auditLog.delete({ where: { id: row.id } }).catch(() => {});
      await prisma.auditLog.create({
        data: {
          action: "webhook.redelivered",
          target: webhookId ?? row.target,
          workspaceId: row.workspaceId,
          metadata: { webhookId, event, url, status: "success", originalFailedAt: row.createdAt },
        },
      }).catch(() => {});
    } else {
      stillFailing++;
      // Drop the original DLQ row and record the failed redelivery so it isn't
      // swept indefinitely (bounded DLQ). Operators can still see the trail.
      await prisma.auditLog.delete({ where: { id: row.id } }).catch(() => {});
      await prisma.auditLog.create({
        data: {
          action: "webhook.redelivered",
          target: webhookId ?? row.target,
          workspaceId: row.workspaceId,
          metadata: { webhookId, event, url, status: "failed", error: outcome.error, originalFailedAt: row.createdAt },
        },
      }).catch(() => {});
    }
  }

  return { attempted: failedRows.length, redelivered, stillFailing };
}
