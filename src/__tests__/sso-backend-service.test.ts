import { describe, it, expect } from "vitest";
import { createJacksonServiceBackend } from "@/lib/sso/backend-service";

/** Minimal fetch stub that records calls and returns a canned JSON body. */
function stubFetch(body: unknown, ok = true, status = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return { ok, status, json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const cfg = (fetchImpl: typeof fetch) => ({ baseUrl: "https://sso.reglayer.com/", apiKey: "secret-key", fetchImpl });

describe("JacksonServiceBackend — request construction", () => {
  it("mode is 'service'", () => {
    const { impl } = stubFetch({});
    expect(createJacksonServiceBackend(cfg(impl)).mode).toBe("service");
  });

  it("authorizeUrl builds the standalone authorize URL (server-resolved tenant, PKCE)", async () => {
    const { impl } = stubFetch({});
    const url = await createJacksonServiceBackend(cfg(impl)).authorizeUrl({
      tenant: "conn_1",
      product: "reglayer",
      state: "st",
      redirectUri: "https://app/cb",
      codeChallenge: "abc",
      codeChallengeMethod: "S256",
      loginHint: "jane@acme.com",
    });
    const u = new URL(url);
    // trailing slash on baseUrl is normalized away
    expect(u.origin + u.pathname).toBe("https://sso.reglayer.com/api/oauth/authorize");
    expect(u.searchParams.get("tenant")).toBe("conn_1");
    expect(u.searchParams.get("product")).toBe("reglayer");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("redirect_uri")).toBe("https://app/cb");
    expect(u.searchParams.get("state")).toBe("st");
    expect(u.searchParams.get("code_challenge")).toBe("abc");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("login_hint")).toBe("jane@acme.com");
  });

  it("exchangeCode POSTs the code (+PKCE verifier) form to /api/oauth/token", async () => {
    const { impl, calls } = stubFetch({ access_token: "tok", expires_in: 120 });
    const out = await createJacksonServiceBackend(cfg(impl)).exchangeCode({
      code: "c1",
      redirectUri: "https://app/cb",
      codeVerifier: "ver",
    });
    expect(out).toEqual({ accessToken: "tok", expiresIn: 120 });
    expect(calls[0].url).toBe("https://sso.reglayer.com/api/oauth/token");
    expect(calls[0].init?.method).toBe("POST");
    const body = calls[0].init?.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("c1");
    expect(body.get("code_verifier")).toBe("ver");
    expect(body.get("client_secret")).toBeNull(); // PKCE path → no dummy creds
  });

  it("userInfo sends Bearer + maps firstName/lastName → name, passes through requested", async () => {
    const { impl, calls } = stubFetch({
      id: "u1",
      email: "jane@acme.com",
      firstName: "Jane",
      lastName: "Doe",
      groups: ["admins"],
      requested: { tenant: "conn_1" },
    });
    const out = await createJacksonServiceBackend(cfg(impl)).userInfo("tok");
    expect(out).toMatchObject({ id: "u1", email: "jane@acme.com", name: "Jane Doe", groups: ["admins"], requested: { tenant: "conn_1" } });
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("upsertConnection POSTs to /api/v1/sso with the management Api-Key", async () => {
    const { impl, calls } = stubFetch({});
    const out = await createJacksonServiceBackend(cfg(impl)).upsertConnection({ tenant: "conn_1", product: "reglayer", rawMetadata: "<xml/>" });
    expect(out).toEqual({ tenant: "conn_1", product: "reglayer" });
    expect(calls[0].url).toBe("https://sso.reglayer.com/api/v1/sso");
    expect(calls[0].init?.method).toBe("POST");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Api-Key secret-key");
  });

  it("deleteConnection DELETEs with tenant/product + Api-Key", async () => {
    const { impl, calls } = stubFetch({});
    await createJacksonServiceBackend(cfg(impl)).deleteConnection({ tenant: "conn_1", product: "reglayer" });
    const u = new URL(calls[0].url);
    expect(u.origin + u.pathname).toBe("https://sso.reglayer.com/api/v1/sso");
    expect(u.searchParams.get("tenant")).toBe("conn_1");
    expect(calls[0].init?.method).toBe("DELETE");
  });

  it("throws on non-OK responses (no silent failures)", async () => {
    const { impl } = stubFetch({}, false, 502);
    await expect(createJacksonServiceBackend(cfg(impl)).exchangeCode({ code: "c", redirectUri: "r" })).rejects.toThrow(/502/);
  });

  it("samlResponse/oidcResponse throw — ACS is hosted by the Jackson service in this mode", async () => {
    const { impl } = stubFetch({});
    const b = createJacksonServiceBackend(cfg(impl));
    await expect(b.samlResponse({ SAMLResponse: "x", RelayState: "y" })).rejects.toThrow(/Jackson service/);
    await expect(b.oidcResponse({})).rejects.toThrow(/Jackson service/);
  });
});
