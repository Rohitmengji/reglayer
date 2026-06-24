/**
 * RegLayer — Embedded BoxyHQ Jackson backend (server-only)
 *
 * Concrete SsoBackend that runs Jackson in-process using the app Postgres.
 * Behind the SsoBackend seam, so swapping to a separate Jackson service later is
 * a single new impl + factory line (review #3). Heavy + server-only — imported
 * lazily via getSsoBackend() so it never reaches client/edge bundles.
 *
 * NOTE: the architecture review (#3) flags embedded Jackson as a scale risk on
 * serverless (per-cold-start init + DB connections). This is the documented
 * "start embedded, swap to a service later" path; validate cold-start + pool
 * load before GA.
 */
import "server-only";
import { controllers } from "@boxyhq/saml-jackson";
import type { JacksonOption, OAuthReq, OAuthTokenReq, SAMLJackson } from "@boxyhq/saml-jackson";
import type { SsoBackend, SsoUserInfo } from "./backend";

let jacksonPromise: Promise<SAMLJackson> | null = null;

function jacksonOptions(): JacksonOption {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("SSO (embedded Jackson) requires DATABASE_URL");
  return {
    externalUrl: process.env.NEXTAUTH_URL ?? "http://localhost:3000",
    samlPath: "/api/auth/sso/acs",
    oidcPath: "/api/auth/sso/oidc",
    samlAudience: process.env.SAML_AUDIENCE ?? "https://saml.reglayer.dev",
    db: { engine: "sql", type: "postgres", url: databaseUrl },
  };
}

function getJackson(): Promise<SAMLJackson> {
  if (!jacksonPromise) jacksonPromise = controllers(jacksonOptions());
  return jacksonPromise;
}

export const embeddedJacksonBackend: SsoBackend = {
  mode: "embedded",

  async authorizeUrl({ tenant, product, state, redirectUri }) {
    const { oauthController } = await getJackson();
    const req: OAuthReq = {
      client_id: "dummy",
      tenant,
      product,
      redirect_uri: redirectUri,
      state,
      response_type: "code",
      code_challenge: "",
      code_challenge_method: "",
    };
    const { redirect_url } = await oauthController.authorize(req);
    if (!redirect_url) throw new Error("Jackson authorize() returned no redirect_url");
    return redirect_url;
  },

  async exchangeCode({ code, redirectUri }) {
    const { oauthController } = await getJackson();
    const body: OAuthTokenReq = {
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      client_id: "dummy",
      client_secret: "dummy",
    };
    const res = await oauthController.token(body);
    return { accessToken: res.access_token };
  },

  async userInfo(accessToken): Promise<SsoUserInfo> {
    const { oauthController } = await getJackson();
    const p = await oauthController.userInfo(accessToken);
    const name = `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
    return {
      id: p.id,
      email: p.email,
      name: name || undefined,
      groups: p.groups,
      raw: (p.raw ?? {}) as Record<string, unknown>,
    };
  },

  async upsertConnection(input) {
    const { connectionAPIController } = await getJackson();
    if (input.protocol === "oidc") {
      await connectionAPIController.createOIDCConnection(
        input as unknown as Parameters<typeof connectionAPIController.createOIDCConnection>[0]
      );
    } else {
      await connectionAPIController.createSAMLConnection(
        input as unknown as Parameters<typeof connectionAPIController.createSAMLConnection>[0]
      );
    }
    return { tenant: String(input.tenant), product: String(input.product ?? "reglayer") };
  },

  async deleteConnection({ tenant, product }) {
    const { connectionAPIController } = await getJackson();
    await connectionAPIController.deleteConnections({ tenant, product });
  },
};
