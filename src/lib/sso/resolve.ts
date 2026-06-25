/**
 * RegLayer — server-side SSO tenant resolution (server-only)
 *
 * The authorize bridge calls this to turn a user-supplied email into the tenant
 * it will hand Jackson. Tenant is therefore ALWAYS server-derived from a VERIFIED
 * domain — the client never supplies it (review #14). Convention: the Jackson
 * tenant is the SSOConnection.id (unique per connection → supports multi-IdP per
 * workspace, #27); product is the connection's product.
 */
import "server-only";
import { prisma } from "@/lib/database/prisma";
import { domainFromEmail } from "./routing";
import { isPublicDomain } from "./guards";
import type { EnforcementPolicy } from "./enforcement";

export interface ResolvedSsoTenant {
  tenant: string; // Jackson tenant = SSOConnection.id
  product: string;
  workspaceId: string;
  connectionId: string;
}

export interface EnforcementContext {
  policy: EnforcementPolicy; // non-OPTIONAL only — null is returned otherwise
  workspaceId: string;
  connectionId: string;
}

/**
 * Enforcement context for an email, or null when nothing should be enforced.
 * Returns non-null ONLY when a LIVE connection (not disabled/deleted, rollout
 * above DISABLED) governs the email's verified domain with a non-OPTIONAL policy
 * — so we never enforce SSO on a domain that has no working SSO path (#23 safety).
 */
export async function getEnforcementForEmail(email: string): Promise<EnforcementContext | null> {
  const domain = domainFromEmail(email);
  if (!domain || isPublicDomain(domain)) return null;

  const verified = await prisma.verifiedDomain.findUnique({
    where: { domain },
    select: {
      connection: {
        select: { id: true, workspaceId: true, enforcementPolicy: true, disabledAt: true, deletedAt: true, rolloutStage: true },
      },
    },
  });

  const c = verified?.connection;
  if (!c || c.disabledAt !== null || c.deletedAt !== null || c.rolloutStage === "DISABLED") return null;
  if (c.enforcementPolicy === "OPTIONAL") return null;
  return { policy: c.enforcementPolicy as EnforcementPolicy, workspaceId: c.workspaceId, connectionId: c.id };
}

/** Resolve the SSO tenant for an email, or null when SSO isn't available/active. */
export async function resolveTenantForEmail(email: string): Promise<ResolvedSsoTenant | null> {
  const domain = domainFromEmail(email);
  if (!domain || isPublicDomain(domain)) return null;

  const verified = await prisma.verifiedDomain.findUnique({
    where: { domain },
    select: {
      connection: {
        select: { id: true, workspaceId: true, product: true, disabledAt: true, deletedAt: true, rolloutStage: true },
      },
    },
  });

  const c = verified?.connection;
  if (!c || c.disabledAt !== null || c.deletedAt !== null || c.rolloutStage === "DISABLED") return null;
  return { tenant: c.id, product: c.product, workspaceId: c.workspaceId, connectionId: c.id };
}
