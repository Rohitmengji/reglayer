/**
 * RegLayer — SSO connection health checks (server-only, #21/#22/#43)
 *
 * Run by the /api/cron/sso-health cron. For every LIVE connection it derives cert
 * health from the stored expiry, updates healthStatus/lastValidatedAt (idempotent
 * — only cert-derived statuses are touched, never INVALID_METADATA etc.), and
 * emails workspace OWNER/ADMINs at the fixed expiry day-marks. Each connection is
 * isolated so one failure can't abort the batch; email is best-effort.
 */
import "server-only";
import { prisma } from "@/lib/database/prisma";
import { logger } from "@/lib/telemetry/logger";
import { evaluateCertHealth, shouldAlertAt, type CertHealthStatus } from "./cert-health";

const CERT_DERIVED: CertHealthStatus[] = ["ACTIVE", "WARNING", "EXPIRED_CERT"];

function isSameUtcDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

export interface HealthRunSummary {
  checked: number;
  warning: number;
  expired: number;
  alerts: number;
}

export async function runSsoHealthChecks(now: Date = new Date()): Promise<HealthRunSummary> {
  const connections = await prisma.sSOConnection.findMany({
    where: { deletedAt: null, disabledAt: null, rolloutStage: { not: "DISABLED" } },
    select: { id: true, label: true, workspaceId: true, certificateExpiresAt: true, warningThresholdDays: true, healthStatus: true, lastValidatedAt: true },
    take: 500,
  });

  let warning = 0;
  let expired = 0;
  let alerts = 0;

  for (const c of connections) {
    try {
      const health = evaluateCertHealth({ certExpiresAt: c.certificateExpiresAt, now, warningThresholdDays: c.warningThresholdDays });
      if (health.status === "WARNING") warning++;
      if (health.status === "EXPIRED_CERT") expired++;

      // Same-UTC-day guard: if this connection was already validated today (e.g.
      // a manual hit of /api/cron/sso-health after the daily piggyback ran), don't
      // re-alert (dedupes same-day double-emails) and don't re-write (no updatedAt churn).
      const alreadyToday = c.lastValidatedAt !== null && isSameUtcDay(c.lastValidatedAt, now);
      // Only manage cert-derived statuses — never clobber a non-cert status.
      const statusChanged = CERT_DERIVED.includes(c.healthStatus as CertHealthStatus) && c.healthStatus !== health.status;

      if (statusChanged || !alreadyToday) {
        await prisma.sSOConnection.update({
          where: { id: c.id },
          data: { lastValidatedAt: now, ...(statusChanged ? { healthStatus: health.status } : {}) },
        });
      }

      if (!alreadyToday && shouldAlertAt(health.daysUntilExpiry) && health.daysUntilExpiry !== null) {
        const sent = await alertCertExpiring(c.workspaceId, c.label, health.daysUntilExpiry);
        if (sent) alerts++;
      }
    } catch (err) {
      logger.error("SSO health check failed for connection", { connectionId: c.id, error: String(err) });
    }
  }

  logger.info("SSO health checks complete", { checked: connections.length, warning, expired, alerts });
  return { checked: connections.length, warning, expired, alerts };
}

/** Email the workspace's OWNER/ADMINs that an IdP cert is expiring. Best-effort. */
async function alertCertExpiring(workspaceId: string, label: string, days: number): Promise<boolean> {
  const { sendEmail, isEmailConfigured } = await import("@/lib/email/service");
  if (!isEmailConfigured()) return false;

  const recipients = await prisma.workspaceMember.findMany({
    where: { workspaceId, role: { in: ["OWNER", "ADMIN"] } },
    select: { user: { select: { email: true } } },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://reglayer.vercel.app";
  const plural = days === 1 ? "day" : "days";
  const subject = `SSO certificate expiring in ${days} ${plural} — ${label}`;
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto">
    <h2 style="font-size:18px;color:#991b1b;margin:0 0 12px">⚠️ SSO certificate expiring</h2>
    <p style="color:#525252;margin:0 0 16px">The identity-provider signing certificate for your SSO connection
      <strong>${label}</strong> expires in <strong>${days} ${plural}</strong>. When it expires, sign-in through this
      connection will stop working.</p>
    <p style="color:#525252;margin:0 0 16px">Update the connection's IdP metadata in RegLayer before then.</p>
    <p><a href="${appUrl}/settings/sso" style="color:#2563eb">Manage SSO connections →</a></p>
  </div>`;
  const text = `SSO certificate for "${label}" expires in ${days} ${plural}. Update the IdP metadata at ${appUrl}/settings/sso before it expires, or sign-in will stop working.`;

  let sent = false;
  for (const r of recipients) {
    const to = r.user?.email;
    if (!to) continue;
    try {
      const res = await sendEmail({ to, subject, html, text });
      if (res.success) sent = true;
    } catch (err) {
      logger.error("SSO cert-expiry email failed", { workspaceId, error: String(err) });
    }
  }
  return sent;
}
