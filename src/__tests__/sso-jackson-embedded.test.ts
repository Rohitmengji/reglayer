// @vitest-environment node
/**
 * Runtime verification of the BoxyHQ Jackson API our EmbeddedJacksonBackend
 * depends on — boots Jackson with the in-memory engine (no Postgres, no browser)
 * and exercises the exact calls the backend makes: createSAMLConnection from real
 * IdP metadata, getConnections, and an SP-initiated authorize that must redirect
 * to the customer IdP. This is the part of the SSO flow we CAN prove without a
 * live IdP round-trip; the full browser SAML assertion still needs mocksaml E2E.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { controllers } from "@boxyhq/saml-jackson";
import type { SAMLJackson } from "@boxyhq/saml-jackson";

// Real mocksaml.com IdP metadata (SSO endpoint: https://mocksaml.com/api/saml/sso).
const MOCKSAML_METADATA = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://saml.example.com/entityid" validUntil="2036-06-24T16:21:37.169Z">
  <md:IDPSSODescriptor WantAuthnRequestsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>MIIC4jCCAcoCCQC33wnybT5QZDANBgkqhkiG9w0BAQsFADAyMQswCQYDVQQGEwJV
SzEPMA0GA1UECgwGQm94eUhRMRIwEAYDVQQDDAlNb2NrIFNBTUwwIBcNMjIwMjI4
MjE0NjM4WhgPMzAyMTA3MDEyMTQ2MzhaMDIxCzAJBgNVBAYTAlVLMQ8wDQYDVQQK
DAZCb3h5SFExEjAQBgNVBAMMCU1vY2sgU0FNTDCCASIwDQYJKoZIhvcNAQEBBQAD
ggEPADCCAQoCggEBALGfYettMsct1T6tVUwTudNJH5Pnb9GGnkXi9Zw/e6x45DD0
RuRONbFlJ2T4RjAE/uG+AjXxXQ8o2SZfb9+GgmCHuTJFNgHoZ1nFVXCmb/Hg8Hpd
4vOAGXndixaReOiq3EH5XvpMjMkJ3+8+9VYMzMZOjkgQtAqO36eAFFfNKX7dTj3V
pwLkvz6/KFCq8OAwY+AUi4eZm5J57D31GzjHwfjH9WTeX0MyndmnNB1qV75qQR3b
2/W5sGHRv+9AarggJkF+ptUkXoLtVA51wcfYm6hILptpde5FQC8RWY1YrswBWAEZ
NfyrR4JeSweElNHg4NVOs4TwGjOPwWGqzTfgTlECAwEAATANBgkqhkiG9w0BAQsF
AAOCAQEAAYRlYflSXAWoZpFfwNiCQVE5d9zZ0DPzNdWhAybXcTyMf0z5mDf6FWBW
5Gyoi9u3EMEDnzLcJNkwJAAc39Apa4I2/tml+Jy29dk8bTyX6m93ngmCgdLh5Za4
khuU3AM3L63g7VexCuO7kwkjh/+LqdcIXsVGO6XDfu2QOs1Xpe9zIzLpwm/RNYeX
UjbSj5ce/jekpAw7qyVVL4xOyh8AtUW1ek3wIw1MJvEgEPt0d16oshWJpoS1OT8L
r/22SvYEo3EmSGdTVGgk3x3s+A0qWAqTcyjr7Q4s/GKYRFfomGwz0TZ4Iw1ZN99M
m0eo2USlSRTVl7QHRTuiuSThHpLKQQ==</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://mocksaml.com/api/saml/sso"/>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://mocksaml.com/api/saml/sso"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

const CALLBACK = "http://localhost:3000/api/auth/callback/boxyhq-saml";

describe("embedded Jackson (in-memory) — connection + authorize", () => {
  let jackson: SAMLJackson;

  beforeAll(async () => {
    jackson = await controllers({
      externalUrl: "http://localhost:3000",
      samlPath: "/api/auth/sso/acs",
      oidcPath: "/api/auth/sso/oidc",
      samlAudience: "https://saml.reglayer.dev",
      db: { engine: "mem" },
    });
  }, 30000);

  afterAll(async () => {
    await jackson.close?.();
  });

  it("creates a SAML connection from IdP metadata (backend.upsertConnection path)", async () => {
    const rec = await jackson.connectionAPIController.createSAMLConnection({
      tenant: "conn_test",
      product: "reglayer",
      rawMetadata: MOCKSAML_METADATA,
      defaultRedirectUrl: CALLBACK,
      redirectUrl: [CALLBACK],
    });
    expect(rec.clientID).toBeTruthy();

    const conns = await jackson.connectionAPIController.getConnections({ tenant: "conn_test", product: "reglayer" });
    expect(conns.length).toBe(1);
  });

  it("issues an SP-initiated authorize redirect to the customer IdP (backend.authorizeUrl path)", async () => {
    const { redirect_url, error } = await jackson.oauthController.authorize({
      client_id: "dummy",
      tenant: "conn_test",
      product: "reglayer",
      redirect_uri: CALLBACK,
      state: "test-state",
      response_type: "code",
      code_challenge: "",
      code_challenge_method: "",
    });
    expect(error).toBeFalsy();
    expect(redirect_url ?? "").toContain("mocksaml.com/api/saml/sso");
  });
});
