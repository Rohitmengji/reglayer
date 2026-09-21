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
import { validateScanUrl, resolvesToInternalIp } from "@/lib/validations/ssrf";
import { renderEmailLayout, emailParagraph, emailButton, emailCallout, escapeHtml, emailAppUrl } from "@/lib/email/layout";
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

      // Dispatch the notification by the monitor's chosen channel. A webhook URL
      // takes precedence; otherwise an "email" monitor emails the workspace owner.
      // (Previously an email-only monitor was a silent no-op — the trigger was
      // logged but the user was never actually notified.)
      if (rule.webhookUrl) {
        dispatchWebhook(rule.webhookUrl, {
          event: "alert.triggered",
          scanId: scan.id,
          url: scan.url,
          score: scan.summary.score,
          message: triggered,
          timestamp: new Date().toISOString(),
        }).catch(() => {/* non-blocking */});
      } else if (monitor.notifyVia === "email") {
        dispatchAlertEmail(workspaceId, {
          url: scan.url,
          score: scan.summary.score,
          message: triggered,
          scanId: scan.id,
        }).catch(() => {/* non-blocking */});
      }
    }
  }

  return triggers;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Email the workspace owner that a user-configured alert fired. Best-effort:
 * no-ops silently when SMTP isn't configured or the workspace has no owner.
 */
async function dispatchAlertEmail(
  workspaceId: string,
  alert: { url: string; score: number; message: string; scanId: string },
): Promise<void> {
  const { sendEmail, isEmailConfigured } = await import("@/lib/email/service");
  if (!isEmailConfigured()) return;

  const owner = await prisma.workspaceMember.findFirst({
    where: { workspaceId, role: "OWNER" },
    select: { user: { select: { email: true } } },
  });
  const to = owner?.user?.email;
  if (!to) return;

  const appUrl = emailAppUrl();
  const reportUrl = `${appUrl}/scans/${alert.scanId}`;
  await sendEmail({
    to,
    subject: `⚠️ RegLayer alert: ${hostnameOf(alert.url)}`,
    html: renderEmailLayout({
      preheader: `A monitor for ${hostnameOf(alert.url)} was triggered`,
      title: "Monitoring alert",
      contentHtml: `
        ${emailParagraph(`A monitor you configured for <strong>${escapeHtml(alert.url)}</strong> was triggered.`)}
        ${emailCallout(escapeHtml(alert.message), "danger")}
        ${emailButton(reportUrl, "View scan")}`,
    }),
    text: `Monitoring alert for ${alert.url}\n${alert.message}\nView scan: ${reportUrl}`,
  });
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
  // Centralized SSRF guard: covers IPv6, IPv4-mapped, DNS rebinding.
  if (validateScanUrl(url) !== null) return;
  if (await resolvesToInternalIp(url)) return;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
  });
}
