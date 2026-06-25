/**
 * ---------------------------------------------------------
 * RegLayer — SSO service-backend smoke test
 * ---------------------------------------------------------
 *
 * WHY: JacksonServiceBackend's request construction is unit-tested, but the live
 * round-trip against a real standalone Jackson can only be verified against a
 * running instance. This is that verification — the one piece unit tests can't cover.
 *
 * WHAT: Against a live Jackson, it creates a throwaway SAML connection (mocksaml
 * metadata), asks for an authorize redirect, asserts it points at the IdP, then
 * deletes the connection. Talks ONLY to the Jackson service over HTTP (no app DB).
 *
 * HOW:
 *   SSO_BACKEND=service \
 *   SSO_JACKSON_URL=https://sso.yourdomain.com \
 *   SSO_JACKSON_API_KEY=<key> \
 *   NEXTAUTH_URL=https://app.yourdomain.com \
 *   npx tsx scripts/smoke-sso-service.ts
 * ---------------------------------------------------------
 */
import "dotenv/config";
import { getSsoBackend } from "../src/lib/sso/backend";

const MOCKSAML_METADATA_URL = "https://mocksaml.com/api/saml/metadata";

async function main() {
  if (process.env.SSO_BACKEND !== "service") {
    throw new Error("Set SSO_BACKEND=service (this smoke test targets the standalone Jackson).");
  }
  if (!process.env.SSO_JACKSON_URL || !process.env.SSO_JACKSON_API_KEY) {
    throw new Error("Set SSO_JACKSON_URL and SSO_JACKSON_API_KEY.");
  }

  const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const callback = `${appUrl}/api/auth/callback/boxyhq-saml`;
  const tenant = `smoke-${Date.now()}`;
  const product = "reglayer";

  const backend = await getSsoBackend();
  console.log(`[smoke] backend mode = ${backend.mode}`);

  console.log(`[smoke] creating throwaway SAML connection (tenant=${tenant})…`);
  await backend.upsertConnection({
    tenant,
    product,
    name: "smoke-test",
    metadataUrl: MOCKSAML_METADATA_URL,
    defaultRedirectUrl: callback,
    redirectUrl: [callback],
  });

  try {
    console.log("[smoke] requesting authorize redirect…");
    const url = await backend.authorizeUrl({ tenant, product, state: "smoke-state", redirectUri: callback });
    console.log(`[smoke] authorize → ${url}`);
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      // unparseable → fails the host check below
    }
    if (host !== "mocksaml.com") {
      throw new Error(`authorize redirect did not point at the mocksaml IdP: ${url}`);
    }
    console.log("[smoke] ✅ PASS — service backend created a connection and produced an IdP redirect.");
  } finally {
    console.log("[smoke] cleaning up throwaway connection…");
    await backend.deleteConnection({ tenant, product }).catch((e) => console.warn("[smoke] cleanup failed:", String(e)));
  }
}

main().catch((err) => {
  console.error("[smoke] ❌ FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
