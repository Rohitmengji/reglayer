/**
 * RegLayer — SSO backend seam  [review #3 / "build so the future upgrade is easy"]
 *
 * The single place the Jackson hosting choice lives. The whole app talks to SSO
 * only through `SsoBackend`, so switching **embedded ↔ separate service** later
 * is one factory change — no routes, providers, or UI move. The review found
 * embedded Jackson won't survive 10k-tenant serverless load, so we start with a
 * clean adapter boundary now and pick/swap the concrete impl in Phase 2.
 *
 * Not wired yet: `getSsoBackend()` throws until a concrete impl is added, so no
 * half-working auth path can ship by accident.
 */

export type SsoBackendMode = "embedded" | "service";

export interface SsoUserInfo {
  id: string;
  email: string;
  name?: string;
  groups?: string[];
  /** Params echoed back by Jackson (incl. the server-resolved `tenant`/`product`). */
  requested: Record<string, string>;
  raw: Record<string, unknown>;
}

export interface SsoAuthorizeInput {
  /** SERVER-resolved tenant (= workspaceId) — never client-supplied (review #14). */
  tenant: string;
  product: string;
  state: string;
  redirectUri: string;
  /** PKCE passthrough from NextAuth (S256). Empty when the flow isn't using PKCE. */
  codeChallenge?: string;
  codeChallengeMethod?: string;
  scope?: string;
  nonce?: string;
  loginHint?: string;
}

export interface SsoBackend {
  readonly mode: SsoBackendMode;
  /** Authorize redirect for a SERVER-resolved tenant (never client-supplied — review #14). */
  authorizeUrl(input: SsoAuthorizeInput): Promise<string>;
  /** Exchange the OAuth code; forwards the PKCE verifier when NextAuth issued one. */
  exchangeCode(input: { code: string; redirectUri: string; codeVerifier?: string }): Promise<{ accessToken: string; expiresIn: number }>;
  userInfo(accessToken: string): Promise<SsoUserInfo>;
  /** IdP → SP SAML assertion POST (ACS); returns the app redirect carrying the OAuth code. */
  samlResponse(body: { SAMLResponse: string; RelayState: string }): Promise<{ redirectUrl: string }>;
  /** IdP → SP OIDC authorization response; returns the app redirect carrying the OAuth code. */
  oidcResponse(query: Record<string, string>): Promise<{ redirectUrl: string }>;
  // Admin connection management (per tenant/product).
  upsertConnection(input: Record<string, unknown>): Promise<{ tenant: string; product: string }>;
  deleteConnection(input: { tenant: string; product: string }): Promise<void>;
}

/** embedded by default; set SSO_BACKEND=service to point at a standalone Jackson. */
export function ssoBackendMode(): SsoBackendMode {
  return process.env.SSO_BACKEND === "service" ? "service" : "embedded";
}

export async function getSsoBackend(): Promise<SsoBackend> {
  const mode = ssoBackendMode();
  if (mode === "embedded") {
    // Lazy server-only import so Jackson never reaches client/edge bundles.
    const { embeddedJacksonBackend } = await import("./backend-embedded");
    return embeddedJacksonBackend;
  }
  // "service" mode = a standalone Jackson reached over HTTPS (review #3's
  // recommended scale path). Implement JacksonServiceBackend behind this same
  // interface when we split Jackson out — nothing else changes.
  throw new Error("SSO backend mode 'service' not implemented yet — set SSO_BACKEND=embedded.");
}
