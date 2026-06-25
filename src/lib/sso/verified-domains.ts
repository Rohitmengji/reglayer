/**
 * RegLayer — Verified-domain claim logic (PURE)  [review #2]
 *
 * The DB's native @@unique on VerifiedDomain.domain is the real race-safe
 * guarantee (claim = `prisma.verifiedDomain.create`; catch P2002 → already
 * claimed). This pure pre-check gives a fast, friendly answer and enforces the
 * public-domain block before we attempt the write.
 */

import { normalizeDomain } from "./routing";
import { isPublicDomain } from "./guards";

export interface VerifiedDomainRow {
  domain: string;
  workspaceId: string;
}

export type ClaimResult =
  | { ok: true; domain: string }
  | { ok: false; reason: "invalid" | "public" | "taken_by_other" };

const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/;

/**
 * Can `requestingWorkspaceId` claim `rawDomain`? Pure — the caller passes the
 * currently-verified domains (or just the one matching row). Idempotent: a
 * workspace re-claiming its own verified domain is ok.
 */
export function canClaimDomain(
  rawDomain: string,
  requestingWorkspaceId: string,
  existingVerified: VerifiedDomainRow[]
): ClaimResult {
  const domain = normalizeDomain(rawDomain);
  if (!DOMAIN_RE.test(domain)) return { ok: false, reason: "invalid" };
  if (isPublicDomain(domain)) return { ok: false, reason: "public" };
  const owner = existingVerified.find((v) => normalizeDomain(v.domain) === domain);
  if (owner && owner.workspaceId !== requestingWorkspaceId) return { ok: false, reason: "taken_by_other" };
  return { ok: true, domain };
}
