/**
 * RegLayer — Jackson SERVICE backend (the production GA path, review #3)
 *
 * Talks to a STANDALONE BoxyHQ Jackson (its own container, e.g. boxyhq/jackson)
 * over its REST API. This keeps Jackson's heavy + vulnerable dependency tree
 * (typeorm, @grpc/grpc-js via @boxyhq/metrics, …) entirely OUT of our app — the
 * exact reason embedded Jackson is dev-only (see backend-embedded.ts). Same
 * `SsoBackend` interface, so the bridge routes / NextAuth provider / JIT are
 * byte-for-byte identical; only what authorize/token/userinfo point at changes.
 *
 * Flow note: in service mode the IdP posts the SAML assertion to the Jackson
 * service's OWN ACS (`{baseUrl}/api/oauth/saml`), so samlResponse/oidcResponse
 * are never invoked on the app — they throw to make a misconfiguration loud.
 *
 * No heavy imports here (just fetch + env), so it's safe to load lazily and the
 * request construction is unit-tested with an injected fetch (backend-service.test.ts).
 * Live endpoint behavior is pending verification against a deployed Jackson.
 */
import type { SsoBackend } from "./backend";

export interface JacksonServiceConfig {
  /** Base URL of the standalone Jackson, e.g. https://sso.reglayer.com */
  baseUrl: string;
  /** Management API key (Jackson `JACKSON_API_KEYS`). */
  apiKey: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export function createJacksonServiceBackend(config: JacksonServiceConfig): SsoBackend {
  const doFetch = config.fetchImpl ?? fetch;
  const base = config.baseUrl.replace(/\/+$/, "");
  const apiKeyHeader = { Authorization: `Api-Key ${config.apiKey}` };

  return {
    mode: "service",

    async authorizeUrl({ tenant, product, state, redirectUri, codeChallenge, codeChallengeMethod, scope, nonce, loginHint }) {
      const u = new URL(`${base}/api/oauth/authorize`);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("client_id", "dummy");
      u.searchParams.set("tenant", tenant);
      u.searchParams.set("product", product);
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("state", state);
      if (codeChallenge) {
        u.searchParams.set("code_challenge", codeChallenge);
        u.searchParams.set("code_challenge_method", codeChallengeMethod ?? "S256");
      }
      if (scope) u.searchParams.set("scope", scope);
      if (nonce) u.searchParams.set("nonce", nonce);
      if (loginHint) u.searchParams.set("login_hint", loginHint);
      return u.toString();
    },

    async exchangeCode({ code, redirectUri, codeVerifier }) {
      const body = new URLSearchParams({ grant_type: "authorization_code", redirect_uri: redirectUri, code });
      if (codeVerifier) body.set("code_verifier", codeVerifier);
      else {
        body.set("client_id", "dummy");
        body.set("client_secret", "dummy");
      }
      const res = await doFetch(`${base}/api/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!res.ok) throw new Error(`Jackson service token exchange failed: ${res.status}`);
      const json = (await res.json()) as { access_token: string; expires_in?: number };
      return { accessToken: json.access_token, expiresIn: json.expires_in ?? 300 };
    },

    async userInfo(accessToken) {
      const res = await doFetch(`${base}/api/oauth/userinfo`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) throw new Error(`Jackson service userinfo failed: ${res.status}`);
      const p = (await res.json()) as {
        id: string;
        email: string;
        firstName?: string;
        lastName?: string;
        groups?: string[];
        requested?: Record<string, string>;
        raw?: Record<string, unknown>;
      };
      const name = `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
      return { id: p.id, email: p.email, name: name || undefined, groups: p.groups, requested: p.requested ?? {}, raw: p.raw ?? {} };
    },

    async samlResponse() {
      throw new Error("service mode: SAML ACS is hosted by the Jackson service ({baseUrl}/api/oauth/saml), not the app");
    },

    async oidcResponse() {
      throw new Error("service mode: OIDC response is hosted by the Jackson service, not the app");
    },

    async upsertConnection(input) {
      const body = new URLSearchParams();
      for (const [k, v] of Object.entries(input)) if (v != null) body.set(k, String(v));
      const res = await doFetch(`${base}/api/v1/sso`, {
        method: "POST",
        headers: { ...apiKeyHeader, "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!res.ok) throw new Error(`Jackson service create connection failed: ${res.status}`);
      return { tenant: String(input.tenant), product: String(input.product ?? "reglayer") };
    },

    async deleteConnection({ tenant, product }) {
      const u = new URL(`${base}/api/v1/sso`);
      u.searchParams.set("tenant", tenant);
      u.searchParams.set("product", product);
      const res = await doFetch(u.toString(), { method: "DELETE", headers: apiKeyHeader });
      if (!res.ok) throw new Error(`Jackson service delete connection failed: ${res.status}`);
    },
  };
}
