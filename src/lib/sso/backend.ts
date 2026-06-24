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
  raw: Record<string, unknown>;
}

export interface SsoBackend {
  readonly mode: SsoBackendMode;
  /** Authorize redirect for a SERVER-resolved tenant (never client-supplied — review #14). */
  authorizeUrl(input: { tenant: string; product: string; state: string; redirectUri: string }): Promise<string>;
  exchangeCode(input: { code: string; redirectUri: string }): Promise<{ accessToken: string }>;
  userInfo(accessToken: string): Promise<SsoUserInfo>;
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
