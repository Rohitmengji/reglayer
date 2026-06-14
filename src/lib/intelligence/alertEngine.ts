/**
 * ---------------------------------------------------------
 * RegLayer — Alert Engine
 * ---------------------------------------------------------
 * 
 * Evaluates scan results against configured alert rules
 * and dispatches notifications when conditions are met.
 * 
 * Called after every scan completes.
 * ---------------------------------------------------------
 */

import { prisma } from "@/lib/database/prisma";
import type { ScanResult } from "@/lib/types";

export interface AlertRule {
  condition: "score_below" | "score_drop" | "new_critical" | "new_violations";
  threshold: number;
  webhookUrl?: string;
}

interface AlertTrigger {
  rule: AlertRule;
  message: string;
  scanId: string;
  url: string;
  score: number;
}

/**
 * Check all alert rules for a completed scan.
 *
 * Tenant-scoped: only monitors belonging to `workspaceId` are evaluated.
 * When no workspace is provided, returns no triggers to prevent cross-tenant leaks.
 */
export async function evaluateAlerts(
  scan: ScanResult,
  workspaceId: string | null
): Promise<AlertTrigger[]> {
  const triggers: AlertTrigger[] = [];

  if (!workspaceId) return triggers;

  // Get alert configurations for this workspace + URL
  const monitors = await prisma.monitor.findMany({
    where: { workspaceId, url: scan.url, enabled: true },
  });

  for (const monitor of monitors) {
    const rule: AlertRule = {
      condition: monitor.condition as AlertRule["condition"],
      threshold: monitor.threshold,
      webhookUrl: monitor.webhookUrl ?? undefined,
    };

    const triggered = await checkCondition(rule, scan);
    if (triggered) {
      triggers.push({
        rule,
        message: triggered,
        scanId: scan.id,
        url: scan.url,
        score: scan.summary.score,
      });

      // Log the trigger (workspace-scoped)
      await prisma.auditLog.create({
        data: {
          action: "alert.triggered",
          target: scan.id,
          workspaceId,
          metadata: {
            condition: rule.condition,
            threshold: rule.threshold,
            message: triggered,
            score: scan.summary.score,
            url: scan.url,
          },
        },
      });

      // Dispatch webhook notification
      if (rule.webhookUrl) {
        dispatchWebhook(rule.webhookUrl, {
          event: "alert.triggered",
          scanId: scan.id,
          url: scan.url,
          score: scan.summary.score,
          message: triggered,
          timestamp: new Date().toISOString(),
        }).catch(() => {/* non-blocking */});
      }
    }
  }

  return triggers;
}

async function checkCondition(rule: AlertRule, scan: ScanResult): Promise<string | null> {
  switch (rule.condition) {
    case "score_below":
      if (scan.summary.score < rule.threshold) {
        return `Score ${scan.summary.score} is below threshold ${rule.threshold}`;
      }
      break;

    case "score_drop": {
      // Compare to previous scan of same URL
      const previousScan = await prisma.scan.findFirst({
        where: { url: scan.url, id: { not: scan.id }, status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        select: { score: true },
      });
      if (previousScan?.score) {
        const drop = previousScan.score - scan.summary.score;
        if (drop >= rule.threshold) {
          return `Score dropped by ${drop.toFixed(1)} points (from ${previousScan.score} to ${scan.summary.score})`;
        }
      }
      break;
    }

    case "new_critical":
      if (scan.summary.critical >= rule.threshold) {
        return `${scan.summary.critical} critical violations found (threshold: ${rule.threshold})`;
      }
      break;

    case "new_violations":
      if (scan.summary.totalViolations >= rule.threshold) {
        return `${scan.summary.totalViolations} violations found (threshold: ${rule.threshold})`;
      }
      break;
  }

  return null;
}

async function dispatchWebhook(url: string, payload: Record<string, unknown>): Promise<void> {
  // SSRF protection — block internal/private targets and require HTTPS
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return; // Invalid URL, skip
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "metadata.google.internal" ||
    /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/.test(hostname)
  ) {
    return; // Skip internal URLs silently
  }
  if (parsed.protocol !== "https:") {
    return; // Require HTTPS
  }

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
}
