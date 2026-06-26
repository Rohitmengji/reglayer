/**
 * RegLayer — Enterprise SSO end-to-end (SAML, embedded/dev backend).
 *
 * Drives the FULL browser round-trip that no unit test can cover: login page →
 * discovery → Jackson authorize → mocksaml IdP → SAML assertion → ACS →
 * NextAuth callback → JIT provisioning → authenticated app. This is the
 * verification that gates "SSO works on dev".
 *
 * OPT-IN ONLY. It is skipped unless RUN_SSO_E2E=1 because it (a) hits the
 * external mocksaml.com IdP and (b) requires a seeded dev connection + the
 * embedded Jackson backend (a devDependency). CI runs Playwright against a
 * deployed base URL where SSO isn't seeded, so this must never run there.
 *
 * To run locally:
 *   1. SSO_ENABLED=true in .env.local
 *   2. npx tsx scripts/seed-sso-dev.ts        # seeds "Dev mocksaml" + example.com
 *   3. npx next dev                            # (or let Playwright start it)
 *   4. RUN_SSO_E2E=1 npx playwright test e2e/sso.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

const RUN = process.env.RUN_SSO_E2E === "1";
// Must be an address under the seeded verified domain (example.com by default).
const SSO_EMAIL = process.env.SSO_E2E_EMAIL || "test@example.com";
const MASTER_EMAIL = process.env.SEED_MASTER_EMAIL || "master@reglayer.dev";
const MASTER_PASSWORD = process.env.SEED_MASTER_PASSWORD || "reglayer2024";

const AUTHED = /\/(dashboard|test|compliance|settings|onboarding|scans)/;

/** Inline credentials login (avoids a flaky helper-module import quirk under Playwright). */
async function loginAsMaster(page: Page) {
  await page.goto("/auth/login");
  await page.fill("#email", MASTER_EMAIL);
  await page.fill('input[type="password"], #password', MASTER_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(AUTHED, { timeout: 15000 });
}

test.describe("Enterprise SSO — mocksaml SAML round-trip (dev)", () => {
  // Serial: these hit the external mocksaml IdP and share workspace/DB state via
  // JIT provisioning, so running them concurrently races (timeouts under load).
  test.describe.configure({ mode: "serial" });
  test.skip(
    !RUN,
    "Opt-in: RUN_SSO_E2E=1 + SSO_ENABLED + seeded dev connection (scripts/seed-sso-dev.ts). Hits external mocksaml.com; excluded from CI.",
  );

  // Pre-seed GDPR consent so the cookie banner never renders — otherwise it
  // overlays the bottom of the page and intercepts the SSO button click.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "reglayer-gdpr-consent",
        JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: "2026-01-01T00:00:00.000Z" }),
      );
    });
  });

  test("discovery gates the SSO button to verified domains only", async ({ page }) => {
    await page.goto("/auth/login");
    // An unknown domain must NOT start SSO — it surfaces the not-available copy.
    await page.fill("#email", "nobody@unverified-domain.example");
    await page.getByRole("button", { name: /continue with sso/i }).click();
    await expect(page.getByText(/single sign-on isn't set up/i)).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("admin API is operational in dev: authed GET /api/sso/connections → 200", async ({ page }) => {
    // Proves the requireSsoAdmin operational gate PASSES when a backend is
    // available (embedded, dev) — i.e. the admin surface works, not a 503/502.
    await loginAsMaster(page);
    const res = await page.request.get("/api/sso/connections");
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.connections)).toBe(true);
  });

  test("full SAML login: login → mocksaml → authenticated", async ({ page }) => {
    // 1. Enter an SSO-enabled email and start the flow.
    await page.goto("/auth/login");
    await page.fill("#email", SSO_EMAIL);
    await page.getByRole("button", { name: /continue with sso/i }).click();

    // 2. Server resolves the verified domain → Jackson builds a signed
    //    SAMLRequest → browser is redirected to the IdP. Anchor the host so the
    //    match can't be satisfied by an arbitrary host appearing as a substring.
    await page.waitForURL(/^https:\/\/mocksaml\.com\//, { timeout: 20000 });

    // 3. mocksaml's canned IdP. Align the asserted identity with our verified
    //    domain where the form allows it, then submit to POST the assertion back.
    const idpEmail = page.locator('input[type="email"], input#email, input[name="email"]');
    if (await idpEmail.count()) {
      await idpEmail.first().fill(SSO_EMAIL).catch(() => {});
    }
    await page.getByRole("button", { name: /sign ?in|submit|continue/i }).first().click();

    // 4. Assertion → /api/auth/sso/acs → NextAuth callback → JIT provision →
    //    we land authenticated and are NOT bounced to the login error page.
    await page.waitForURL(AUTHED, { timeout: 30000 });
    await expect(page).toHaveURL(AUTHED);
    await expect(page).not.toHaveURL(/\/auth\/login/);
  });
});
