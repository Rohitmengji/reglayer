/**
 * RegLayer — SSO JIT provisioning planner (PURE)
 *
 * The security-critical "what should happen" decision for an SSO sign-in,
 * isolated as a pure function so it's exhaustively testable and the (future)
 * OAuth callback just executes the plan against Prisma:
 *  - re-checks the asserted email domain against the connection's VERIFIED
 *    domains (defense-in-depth cross-tenant guard, review #4),
 *  - resolves the role by precedence (invite > existing > IdP-group > default),
 *  - maps requested profile attributes onto fields the User model ACTUALLY has
 *    (today only name/fullName — review #13 noted department/title/… don't exist).
 */

import { assertionDomainMatches } from "./guards";
import { resolveProvisionedRole, mapAttributes, type WorkspaceRole, type AttributeMappingInput } from "./routing";

export interface ProvisioningRequest {
  assertedEmail: string;
  connectionVerifiedDomains: string[];
  inviteRole?: WorkspaceRole | null;
  existingRole?: WorkspaceRole | null;
  idpGroups?: string[];
  roleMappings?: { idpGroup: string; role: WorkspaceRole }[];
  defaultRole: WorkspaceRole;
  claims?: Record<string, unknown>;
  attributeMappings?: AttributeMappingInput[];
}

export type ProvisioningPlan =
  | { ok: true; role: WorkspaceRole; profile: Record<string, string> }
  | { ok: false; reason: "domain_mismatch" };

/** Columns the User model actually has — mapped attributes are restricted to these. */
const SUPPORTED_PROFILE_FIELDS = new Set(["name", "fullName"]);

export function planProvisioning(req: ProvisioningRequest): ProvisioningPlan {
  // Cross-tenant guard: the IdP-asserted email MUST belong to one of the
  // connection's verified domains, or we refuse to provision.
  if (!assertionDomainMatches(req.assertedEmail, req.connectionVerifiedDomains)) {
    return { ok: false, reason: "domain_mismatch" };
  }

  const role = resolveProvisionedRole({
    inviteRole: req.inviteRole ?? null,
    existingRole: req.existingRole ?? null,
    idpGroups: req.idpGroups ?? [],
    roleMappings: req.roleMappings ?? [],
    defaultRole: req.defaultRole,
  });

  const mapped = req.claims && req.attributeMappings ? mapAttributes(req.claims, req.attributeMappings) : {};
  // "fullName" maps onto the User.name column; drop targets the schema lacks.
  const profile: Record<string, string> = {};
  for (const [k, v] of Object.entries(mapped)) {
    if (k === "fullName") profile.name = v;
    else if (SUPPORTED_PROFILE_FIELDS.has(k)) profile[k] = v;
  }

  return { ok: true, role, profile };
}
