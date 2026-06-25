/**
 * RegLayer — SSO connection health checks (server-only, #21/#22/#43)
 *
 * Run daily by /api/cron/sso-health (and piggybacked on run-schedules). For each
 * LIVE connection it:
 *   - actively self-heals: re-fetches SAML metadata / probes the OIDC discovery
 *     endpoint (SSRF-guarded, 6s timeout) — refreshing the cert expiry, or marking
 *     INVALID_METADATA / VALIDATION_FAILED when unreachable;
 *   - derives cert health from the (refreshed) expiry;
 *   - writes healthStatus + lastValidatedAt;
 *   - emails OWNER/ADMINs at cert day-marks, and once on transition INTO a broken
 *     state.
 *
 * Once-per-UTC-day per connection (a same-day re-run is a no-op; a partial sweep
 * cut short by the cron budget resumes next run since unvalidated rows aren't
 * skipped). The cron is the sole authority for healthStatus. Scale note: probes
 * are serial with a 6s cap — fine for the connection counts this serves; a large
 * fleet would want batching.
 */
import "server-only";
import { prisma } from "@/lib/database/prisma";
import { logger } from "@/lib/telemetry/logger";
import { validateScanUrl, resolvesToInternalIp } from "@/lib/validations/ssrf";
import { evaluateCertHealth, shouldAlertAt, parseCertNotAfterFromSamlMetadata } from "./cert-health";

type ManagedHealthStatus = "ACTIVE" | "WARNING" | "EXPIRED_CERT" | "INVALID_METADATA" | "VALIDATION_FAILED";

function isSameUtcDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

/**
 * SSRF-guarded fetch that follows redirects MANUALLY, re-validating every hop —
 * so a public metadata URL can't 30x-redirect into an internal address (the gap
 * a plain `redirect:"follow"` would leave). Returns the final Response, or null
 * on a blocked/timed-out/too-many-hops/errored request.
 */
async function safeFetch(url: string, maxHops = 3): Promise<Response | null> {
  let current = url;
  for (let hop = 0; hop <= maxHops; hop++) {
    if (validateScanUrl(current) !== null) return null;
    if (await resolvesToInternalIp(current)) return null;
    let res: Response;
    try {
      res = await fetch(current, { signal: AbortSignal.timeout(6000), redirect: "manual" });
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return null;
      try {
        current = new URL(loc, current).toString();
      } catch {
        return null;
      }
      continue; // re-validate the redirect target on the next iteration
    }
    return res;
  }
  return null; // exceeded redirect budget
}

/** SSRF-guarded GET body text, or null on any failure. */
async function safeFetchText(url: string): Promise<string | null> {
  const res = await safeFetch(url);
  if (!res || !res.ok) return null;
  try {
    return await res.text();
  } catch {
    return null;
  }
}

/** SSRF-guarded reachability probe (just needs a 2xx). */
async function safeFetchOk(url: string): Promise<boolean> {
  const res = await safeFetch(url);
  return !!res && res.ok;
}

export interface HealthRunSummary {
  checked: number;
  warning: number;
  expired: number;
  invalid: number;
  alerts: number;
}

export async function runSsoHealthChecks(now: Date = new Date()): Promise<HealthRunSummary> {
  const connections = await prisma.sSOConnection.findMany({
    where: { deletedAt: null, disabledAt: null, rolloutStage: { not: "DISABLED" } },
    select: {
      id: true,
      label: true,
      workspaceId: true,
      protocol: true,
      metadataUrl: true,
      oidcDiscoveryUrl: true,
      certificateExpiresAt: true,
      warningThresholdDays: true,
      healthStatus: true,
      lastValidatedAt: true,
    },
    // Least-recently-validated (and never-validated) first, so a sweep cut short
    // by the cron budget deterministically makes forward progress next run.
    orderBy: { lastValidatedAt: { sort: "asc", nulls: "first" } },
    take: 500,
  });

  let checked = 0;
  let warning = 0;
  let expired = 0;
  let invalid = 0;
  let alerts = 0;

  for (const c of connections) {
    try {
      // Once per UTC day; a same-day re-run is a no-op.
      if (c.lastValidatedAt && isSameUtcDay(c.lastValidatedAt, now)) continue;
      checked++;

      // Active self-heal probe (best-effort). Only connections with a stored
      // public endpoint are probed; rawMetadata SAML stays cert-only.
      let probeFailure: "INVALID_METADATA" | "VALIDATION_FAILED" | null = null;
      let certExpiresAt = c.certificateExpiresAt;
      if (c.protocol === "SAML" && c.metadataUrl) {
        const xml = await safeFetchText(c.metadataUrl);
        if (xml === null) {
          probeFailure = "INVALID_METADATA";
        } else {
          const exp = parseCertNotAfterFromSamlMetadata(xml);
          if (!exp) probeFailure = "INVALID_METADATA";
          else certExpiresAt = exp; // refresh from live metadata
        }
      } else if (c.protocol === "OIDC" && c.oidcDiscoveryUrl) {
        if (!(await safeFetchOk(c.oidcDiscoveryUrl))) probeFailure = "VALIDATION_FAILED";
      }

      const cert = evaluateCertHealth({ certExpiresAt, now, warningThresholdDays: c.warningThresholdDays });
      const newStatus: ManagedHealthStatus = probeFailure ?? cert.status;
      if (newStatus === "WARNING") warning++;
      else if (newStatus === "EXPIRED_CERT") expired++;
      else if (newStatus === "INVALID_METADATA" || newStatus === "VALIDATION_FAILED") invalid++;

      const wasHealthy = c.healthStatus === "ACTIVE" || c.healthStatus === "WARNING";
      await prisma.sSOConnection.update({
        where: { id: c.id },
        data: {
          lastValidatedAt: now,
          healthStatus: newStatus,
          ...(certExpiresAt !== c.certificateExpiresAt ? { certificateExpiresAt: certExpiresAt } : {}),
        },
      });

      // Alerts (best-effort): cert day-marks when the cert is the concern, or a
      // one-shot alert on transition INTO a broken config state.
      if (!probeFailure && cert.daysUntilExpiry !== null && shouldAlertAt(cert.daysUntilExpiry)) {
        if (await alertCertExpiring(c.workspaceId, c.label, cert.daysUntilExpiry)) alerts++;
      } else if (probeFailure && wasHealthy) {
        if (await alertConnectionUnhealthy(c.workspaceId, c.label, probeFailure)) alerts++;
      }
    } catch (err) {
      logger.error("SSO health check failed for connection", { connectionId: c.id, error: String(err) });
    }
  }

  logger.info("SSO health checks complete", { checked, warning, expired, invalid, alerts });
  return { checked, warning, expired, invalid, alerts };
}

async function workspaceAdminEmails(workspaceId: string): Promise<string[]> {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, role: { in: ["OWNER", "ADMIN"] } },
    select: { user: { select: { email: true } } },
  });
  return members.map((m) => m.user?.email).filter((e): e is string => !!e);
}

/** Email the workspace's OWNER/ADMINs that an IdP cert is expiring. Best-effort. */
async function alertCertExpiring(workspaceId: string, label: string, days: number): Promise<boolean> {
  const { sendEmail, isEmailConfigured } = await import("@/lib/email/service");
  if (!isEmailConfigured()) return false;
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
  for (const to of await workspaceAdminEmails(workspaceId)) {
    try {
      const res = await sendEmail({ to, subject, html, text });
      if (res.success) sent = true;
    } catch (err) {
      logger.error("SSO cert-expiry email failed", { workspaceId, error: String(err) });
    }
  }
  return sent;
}

/** Email the workspace's OWNER/ADMINs that a connection just became unhealthy. Best-effort. */
async function alertConnectionUnhealthy(workspaceId: string, label: string, reason: "INVALID_METADATA" | "VALIDATION_FAILED"): Promise<boolean> {
  const { sendEmail, isEmailConfigured } = await import("@/lib/email/service");
  if (!isEmailConfigured()) return false;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://reglayer.vercel.app";
  const what =
    reason === "INVALID_METADATA"
      ? "its SAML metadata could not be fetched or parsed"
      : "its OIDC discovery endpoint is unreachable";
  const subject = `SSO connection unhealthy — ${label}`;
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto">
    <h2 style="font-size:18px;color:#991b1b;margin:0 0 12px">⚠️ SSO connection unhealthy</h2>
    <p style="color:#525252;margin:0 0 16px">A health check found that your SSO connection <strong>${label}</strong> is
      unhealthy: ${what}. Sign-in through this connection may be failing.</p>
    <p><a href="${appUrl}/settings/sso" style="color:#2563eb">Review SSO connections →</a></p>
  </div>`;
  const text = `SSO connection "${label}" is unhealthy: ${what}. Review it at ${appUrl}/settings/sso.`;

  let sent = false;
  for (const to of await workspaceAdminEmails(workspaceId)) {
    try {
      const res = await sendEmail({ to, subject, html, text });
      if (res.success) sent = true;
    } catch (err) {
      logger.error("SSO unhealthy-connection email failed", { workspaceId, error: String(err) });
    }
  }
  return sent;
}
