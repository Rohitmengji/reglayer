/**
 * RegLayer — SSO enforcement decision (PURE)  [review #24 enforcement, #23 break-glass]
 *
 * Decides whether a NON-SSO login (password / Google) is allowed when the user's
 * verified email domain is governed by a LIVE SSO connection. Kept pure so the
 * lockout-sensitive logic is exhaustively testable; the signIn callback just
 * loads the inputs and executes the decision.
 *
 * Break-glass (#23): a workspace OWNER (and platform master admin) may ALWAYS use
 * a non-SSO provider even under enforcement — so an IdP outage / misconfig can
 * never lock the org out of its own workspace. Every such bypass is logged.
 */

export type EnforcementPolicy = "OPTIONAL" | "ENFORCED" | "ENFORCED_VERIFIED_DOMAINS";

export interface EnforcementInput {
  /** The auth provider being used for this login (e.g. "credentials", "google", "boxyhq-saml"). */
  provider: string;
  /** Governing LIVE connection's policy, or null when no live connection governs the domain. */
  policy: EnforcementPolicy | null;
  /** User is an OWNER of the governed workspace — a break-glass identity. */
  isWorkspaceOwner: boolean;
  /** Platform master admin — a break-glass identity (support access). */
  isMasterAdmin: boolean;
}

export type EnforcementDecision =
  | { allow: true; breakGlass: boolean }
  | { allow: false; reason: "sso_required" };

export const SSO_PROVIDER_ID = "boxyhq-saml";

export function evaluateEnforcement(i: EnforcementInput): EnforcementDecision {
  // The SSO provider itself is always allowed — it IS the enforced path.
  if (i.provider === SSO_PROVIDER_ID) return { allow: true, breakGlass: false };
  // No governing live connection, or policy OPTIONAL → enforcement does not apply.
  if (!i.policy || i.policy === "OPTIONAL") return { allow: true, breakGlass: false };
  // Enforced: only break-glass identities may use a non-SSO provider.
  if (i.isMasterAdmin || i.isWorkspaceOwner) return { allow: true, breakGlass: true };
  return { allow: false, reason: "sso_required" };
}
