/**
 * RegLayer — SSO security guards (PURE)
 *
 * Hardening that the architecture review flagged as must-fix-before-GA, kept as
 * pure functions (no DB/Next) so they are unit-testable and reusable by the
 * Phase-2 auth path:
 *  - Public/freemail domains can NEVER route (you can't prove ownership of
 *    gmail.com; defense-in-depth even though DNS-TXT would also fail).            [review #10]
 *  - At provisioning, the IdP-asserted email's domain MUST equal one of the
 *    connection's verified domains — prevents a misrouted/forged assertion from
 *    landing a user in another tenant.                                            [review #4]
 *  - Session-revocation check (issued-before-revoked) so a deprovisioned user's
 *    still-valid JWT can be force-expired once wired into the jwt callback.        [review #1]
 */

import { domainFromEmail, normalizeDomain } from "./routing";

/** Freemail / public domains that may never be claimed or routed for SSO. */
export const PUBLIC_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "yahoo.com", "ymail.com", "icloud.com", "me.com", "mac.com", "aol.com",
  "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.net", "mail.com",
  "zoho.com", "yandex.com", "yandex.ru", "qq.com", "163.com", "126.com",
]);

/** True if the domain is a public/freemail provider (never routable for SSO). */
export function isPublicDomain(domain: string): boolean {
  return PUBLIC_EMAIL_DOMAINS.has(normalizeDomain(domain));
}

/**
 * Defense-in-depth at provisioning time (review #4): only provision a user into
 * a workspace if the IdP-asserted email's domain is one of the connection's
 * VERIFIED domains. Callers pass the connection's already-verified domains.
 */
export function assertionDomainMatches(assertedEmail: string, verifiedDomains: string[]): boolean {
  const domain = domainFromEmail(assertedEmail);
  if (!domain) return false;
  if (isPublicDomain(domain)) return false;
  return verifiedDomains.map((d) => normalizeDomain(d)).includes(domain);
}

/**
 * Session-revocation check (review #1). NextAuth JWTs carry `iat` (issued-at,
 * seconds). If the workspace/user has a revocation timestamp newer than the
 * token's issue time, the session must be rejected (force re-auth). Pure so it
 * can be unit-tested and dropped into the `jwt` callback's existing Redis
 * auth-context lookup. `revokedAtSec` null ⇒ never revoked.
 */
export function isSessionRevoked(tokenIssuedAtSec: number | undefined, revokedAtSec: number | null): boolean {
  if (revokedAtSec === null || revokedAtSec === undefined) return false;
  if (typeof tokenIssuedAtSec !== "number") return true; // no issue time ⇒ fail closed
  return tokenIssuedAtSec < revokedAtSec;
}
