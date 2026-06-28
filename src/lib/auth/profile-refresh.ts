/**
 * RegLayer — should a sign-in refresh the stored profile (name / image)?
 *
 * The signIn callback upserts a User by email on every login. Refreshing
 * name/image from the provider is only safe when the email is VERIFIED —
 * otherwise an unverified OAuth/IdP assertion could overwrite (or, combined with
 * email-based linking, hijack) an existing account's identity. Pure + testable.
 */
export function emailIsVerified(provider: string | undefined, profile: unknown): boolean {
  // Credentials: the user authenticated with their own password.
  // boxyhq-saml: the email is IdP-asserted within a verified-owned domain.
  if (provider === "credentials" || provider === "boxyhq-saml") return true;
  // OAuth providers (e.g. Google) expose an `email_verified` claim on the profile.
  return (profile as { email_verified?: boolean } | null | undefined)?.email_verified === true;
}
