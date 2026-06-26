/**
 * RegLayer — Enterprise SSO: pure routing & provisioning logic
 *
 * WHY: SSO is auth-critical and multi-tenant. The decisions that must be exactly
 *      right — which workspace an email routes to, what role a user gets, which
 *      domains may route — are isolated here as PURE functions (no DB, no Jackson,
 *      no Next), so they are exhaustively unit-testable and the IdP/transport
 *      layers (Phase 2+) just call into them.
 * WHAT: domain normalization, server-derived connection routing (verified-only,
 *      fail-safe), role precedence, IdP attribute mapping, DNS-TXT verification.
 * HOW: callers load DB rows and pass plain inputs; nothing here trusts a
 *      client-supplied tenant/workspace (req #14) — routing is derived solely
 *      from a VERIFIED, non-deleted domain owned by exactly one workspace.
 */

export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
export type DomainVerificationStatus = "PENDING" | "VERIFIED" | "FAILED";
export type RolloutStage = "DISABLED" | "INTERNAL" | "BETA" | "GA";

export interface SsoDomainInput {
  domain: string;
  verificationStatus: DomainVerificationStatus;
  deletedAt: Date | null;
}

export interface SsoConnectionInput {
  id: string;
  workspaceId: string;
  rolloutStage: RolloutStage;
  disabledAt: Date | null;
  deletedAt: Date | null;
  domains: SsoDomainInput[];
}

export type ConnectionResolution =
  | { ok: true; connectionId: string; workspaceId: string }
  | {
      ok: false;
      reason: "no_email" | "unknown_domain" | "domain_unverified" | "connection_disabled" | "rollout_excluded";
    };

// ─── Domain helpers ───────────────────────────────────────

/** Lowercase, trim, strip a leading "@" or "mailto:". */
export function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^mailto:/, "").replace(/^@/, "");
}

/** Extract the (normalized) domain from an email, or null if malformed. */
export function domainFromEmail(email: string): string | null {
  const at = email.trim().toLowerCase().lastIndexOf("@");
  if (at <= 0 || at === email.trim().length - 1) return null;
  const domain = email.trim().toLowerCase().slice(at + 1);
  // reject obviously invalid domains (no dot, spaces)
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  return domain;
}

/** A domain may route only if it is VERIFIED and not soft-deleted. */
export function isVerifiedRoutable(d: SsoDomainInput): boolean {
  return d.verificationStatus === "VERIFIED" && d.deletedAt === null;
}

// ─── Connection routing (server-derived, verified-only, fail-safe) ───

/**
 * Resolve which SSO connection an email should authenticate through.
 * `allowedStages` gates rollout exposure (default: GA only). Returns a typed
 * non-ok reason so the discovery endpoint can show a generic, non-revealing error.
 */
export function resolveConnectionForEmail(
  email: string,
  connections: SsoConnectionInput[],
  opts: { allowedStages?: RolloutStage[] } = {}
): ConnectionResolution {
  const allowedStages = opts.allowedStages ?? ["GA"];
  const domain = domainFromEmail(email);
  if (!domain) return { ok: false, reason: "no_email" };

  const live = connections.filter((c) => c.deletedAt === null);
  // Any (even disabled/unverified) connection that lists this domain at all?
  const claimants = live.filter((c) => c.domains.some((d) => normalizeDomain(d.domain) === domain && d.deletedAt === null));
  if (claimants.length === 0) return { ok: false, reason: "unknown_domain" };

  // Verified routing only.
  const verified = claimants.filter((c) => c.domains.some((d) => normalizeDomain(d.domain) === domain && isVerifiedRoutable(d)));
  if (verified.length === 0) return { ok: false, reason: "domain_unverified" };

  const enabled = verified.filter((c) => c.disabledAt === null);
  if (enabled.length === 0) return { ok: false, reason: "connection_disabled" };

  const exposed = enabled.filter((c) => allowedStages.includes(c.rolloutStage));
  if (exposed.length === 0) return { ok: false, reason: "rollout_excluded" };

  // Verified-domain global uniqueness (enforced at write time) means exactly one.
  const chosen = exposed[0];
  return { ok: true, connectionId: chosen.id, workspaceId: chosen.workspaceId };
}

// ─── Role precedence (req #4) ─────────────────────────────

const ROLE_RANK: Record<WorkspaceRole, number> = { VIEWER: 0, MEMBER: 1, ADMIN: 2, OWNER: 3 };

export interface RolePrecedenceInput {
  inviteRole?: WorkspaceRole | null; // a pending explicit invite — highest priority
  existingRole?: WorkspaceRole | null; // current membership — never downgraded by SSO
  idpGroups?: string[]; // groups asserted by the IdP
  roleMappings?: { idpGroup: string; role: WorkspaceRole }[];
  defaultRole: WorkspaceRole; // connection fallback
}

/**
 * SSO must NEVER mint an owner. Ownership is granted only via explicit
 * owner-transfer tooling — never an IdP group, a connection default, or an
 * invite. The admin write endpoints already reject OWNER, but this executor is
 * where the role is actually applied at sign-in, so the invariant is enforced
 * here too (defense in depth: a row written outside the API — seed, migration,
 * direct DB, or a future endpoint that forgets the cap — must still never
 * escalate a login to OWNER). Preserving an EXISTING owner via never-downgrade
 * is a separate concern and is intentionally NOT capped.
 */
const MAX_SSO_ROLE: WorkspaceRole = "ADMIN";
const capSso = (r: WorkspaceRole): WorkspaceRole =>
  ROLE_RANK[r] > ROLE_RANK[MAX_SSO_ROLE] ? MAX_SSO_ROLE : r;

/**
 * Precedence: explicit invite > existing membership (never downgrade) > IdP-group
 * mapping > connection default. SSO never lowers a role a user already holds, and
 * never raises one to OWNER (see capSso).
 */
export function resolveProvisionedRole(input: RolePrecedenceInput): WorkspaceRole {
  if (input.inviteRole) return capSso(input.inviteRole);

  // Case-insensitive match: IdPs are inconsistent about group-name casing, and a
  // drift between the stored mapping and the asserted group must NOT silently
  // drop a user to the default role. (Storage also lowercases idpGroup.)
  const groups = (input.idpGroups ?? []).map((g) => g.toLowerCase());
  const matched = (input.roleMappings ?? [])
    .filter((m) => groups.includes(m.idpGroup.toLowerCase()))
    .map((m) => m.role);
  const mapped = matched.length
    ? matched.reduce((a, b) => (ROLE_RANK[a] >= ROLE_RANK[b] ? a : b))
    : undefined;

  // Cap the SSO-derived role at ADMIN before applying precedence — a rogue
  // OWNER mapping/default must never reach a real membership.
  const candidate = capSso(mapped ?? input.defaultRole);
  if (input.existingRole && ROLE_RANK[input.existingRole] >= ROLE_RANK[candidate]) {
    return input.existingRole; // never downgrade (preserves an existing OWNER)
  }
  return candidate;
}

// ─── Attribute mapping (req #26) ──────────────────────────

export interface AttributeMappingInput {
  sourceAttr: string;
  targetField: string;
}

/** Map IdP claim values onto user-profile target fields (present, string-coercible claims only). */
export function mapAttributes(
  claims: Record<string, unknown>,
  mappings: AttributeMappingInput[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { sourceAttr, targetField } of mappings) {
    const v = claims[sourceAttr];
    if (v !== undefined && v !== null && (typeof v === "string" || typeof v === "number")) {
      const s = String(v).trim();
      if (s) out[targetField] = s;
    }
  }
  return out;
}

// ─── DNS-TXT domain verification (req #1) ─────────────────

/** The exact TXT record value a domain owner must publish to prove control. */
export function expectedTxtRecord(token: string): string {
  return `reglayer-verification=${token}`;
}

/** True if the resolved TXT records contain our expected verification value. */
export function dnsTxtContainsToken(txtRecords: string[], token: string): boolean {
  const expected = expectedTxtRecord(token);
  return txtRecords.map((r) => r.trim()).includes(expected);
}
