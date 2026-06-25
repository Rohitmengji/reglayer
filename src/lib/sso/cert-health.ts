/**
 * RegLayer — SSO certificate-health logic (#21/#22)
 *
 * Expired IdP signing certs are the most common silent SSO outage. We parse the
 * signing cert's expiry from the SAML metadata at connection-create time and
 * store it on `SSOConnection.certificateExpiresAt`; this module derives health +
 * decides when to send proactive expiry alerts. The cert-parsing uses node:crypto
 * (server only), but the functions are otherwise pure + deterministic, so they're
 * unit-tested directly.
 */
import { X509Certificate } from "node:crypto";

export type CertHealthStatus = "ACTIVE" | "WARNING" | "EXPIRED_CERT";

export interface CertHealth {
  status: CertHealthStatus;
  /** Whole days until expiry (negative once expired); null when no cert is tracked. */
  daysUntilExpiry: number | null;
}

const MS_PER_DAY = 86_400_000;

/** Fixed day-marks at which we email owners (independent of the WARNING threshold). */
export const CERT_ALERT_DAYS = [90, 60, 30, 14, 7, 1];

/**
 * Earliest `notAfter` across all X509 signing certs in a SAML metadata document,
 * or null if none parse. (Earliest = the one that breaks SSO first.)
 */
export function parseCertNotAfterFromSamlMetadata(xml: string): Date | null {
  const matches = xml.matchAll(/<(?:[A-Za-z0-9]+:)?X509Certificate>([\s\S]*?)<\/(?:[A-Za-z0-9]+:)?X509Certificate>/g);
  let earliest: Date | null = null;
  for (const m of matches) {
    const b64 = m[1].replace(/\s+/g, "");
    if (!b64) continue;
    try {
      const cert = new X509Certificate(`-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----`);
      const notAfter = new Date(cert.validTo);
      if (!Number.isNaN(notAfter.getTime()) && (earliest === null || notAfter < earliest)) earliest = notAfter;
    } catch {
      // Unparseable cert block — skip it.
    }
  }
  return earliest;
}

/** Derive cert health from a stored expiry. No expiry tracked ⇒ ACTIVE (unmonitored). */
export function evaluateCertHealth(input: { certExpiresAt: Date | null; now: Date; warningThresholdDays: number }): CertHealth {
  if (!input.certExpiresAt) return { status: "ACTIVE", daysUntilExpiry: null };
  const days = Math.ceil((input.certExpiresAt.getTime() - input.now.getTime()) / MS_PER_DAY);
  if (days <= 0) return { status: "EXPIRED_CERT", daysUntilExpiry: days };
  if (days <= input.warningThresholdDays) return { status: "WARNING", daysUntilExpiry: days };
  return { status: "ACTIVE", daysUntilExpiry: days };
}

/**
 * Whether to email at this exact day-mark. Daily cron computes integer days, so
 * each mark is hit once → one alert per threshold, no schema column needed to
 * dedupe (a missed day simply skips that mark; the next one still fires).
 */
export function shouldAlertAt(daysUntilExpiry: number | null): boolean {
  return daysUntilExpiry !== null && CERT_ALERT_DAYS.includes(daysUntilExpiry);
}
