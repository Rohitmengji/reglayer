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

export interface ResolvedSsoTenant {
  tenant: string; // Jackson tenant = SSOConnection.id
  product: string;
  workspaceId: string;
  connectionId: string;
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
