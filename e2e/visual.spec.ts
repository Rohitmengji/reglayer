/**
 * RegLayer — Visual Regression E2E Tests
 *
 * Captures full-page screenshots for all key pages and compares against
 * baseline snapshots. Run `npx playwright test e2e/visual.spec.ts --update-snapshots`
 * to create/update baseline screenshots.
 */
import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.SEED_MASTER_EMAIL || "master@reglayer.dev";
const PASSWORD = process.env.SEED_MASTER_PASSWORD || "reglayer2024";

async function login(page: Page) {
  await page.goto("/auth/login");
  await page.fill("#email", EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(dashboard|test|compliance|settings|scans)/, { timeout: 15000 });
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    document.querySelectorAll("*").forEach((el) => {
      const s = (el as HTMLElement).style;
      s.animation = "none";
      s.transition = "none";
    });
    document.querySelectorAll("time, [data-testid='timestamp']").forEach((el) => {
      (el as HTMLElement).style.visibility = "hidden";
    });
  });
}

// ─── Public Pages ──────────────────────────────────────────────

const PUBLIC_PAGES = [
  { name: "landing", path: "/" },
  { name: "pricing", path: "/pricing" },
  { name: "features", path: "/features" },
  { name: "standards", path: "/standards" },
  { name: "docs", path: "/docs" },
  { name: "api-reference", path: "/api-reference" },
  { name: "contact", path: "/contact" },
  { name: "privacy", path: "/privacy" },
  { name: "terms", path: "/terms" },
  { name: "login", path: "/auth/login" },
  { name: "register", path: "/auth/register" },
  { name: "signout", path: "/auth/signout" },
  { name: "forgot-password", path: "/auth/forgot-password" },
  { name: "request-access", path: "/request-access" },
];

test.describe("Visual regression — Public pages", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  for (const { name, path } of PUBLIC_PAGES) {
    test(`public-${name} matches snapshot`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem(
          "reglayer-gdpr-consent",
          JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: "2026-01-01T00:00:00.000Z" }),
        );
      });
      await page.goto(path);
      await settle(page);
      await expect(page).toHaveScreenshot(`public-${name}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.01,
      });
    });
  }
});

// ─── Authenticated Pages ───────────────────────────────────────

const AUTHED_PAGES = [
  { name: "dashboard", path: "/dashboard" },
  { name: "scans", path: "/test?tab=scans" },
  { name: "violations", path: "/violations" },
  { name: "compliance", path: "/compliance?tab=matrix" },
  { name: "reports", path: "/reports?tab=trends" },
  { name: "settings-plan", path: "/settings?tab=plan" },
  { name: "settings-account", path: "/settings?tab=account" },
  { name: "settings-apikeys", path: "/settings?tab=api-keys" },
  { name: "manage", path: "/manage?tab=team" },
  { name: "automation", path: "/automation?tab=remediation" },
  { name: "analysis", path: "/analysis?tab=screen-reader" },
  { name: "notifications", path: "/notifications" },
];

test.describe("Visual regression — Authenticated pages", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "reglayer-gdpr-consent",
        JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: "2026-01-01T00:00:00.000Z" }),
      );
    });
    await login(page);
  });

  for (const { name, path } of AUTHED_PAGES) {
    test(`authed-${name} matches snapshot`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      await expect(page).toHaveScreenshot(`authed-${name}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.02,
      });
    });
  }
});

// ─── Mobile Responsive ────────────────────────────────────────

test.describe("Visual regression — Mobile responsive", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  const MOBILE_PAGES = [
    { name: "landing-mobile", path: "/" },
    { name: "pricing-mobile", path: "/pricing" },
    { name: "login-mobile", path: "/auth/login" },
  ];

  for (const { name, path } of MOBILE_PAGES) {
    test(`${name} matches snapshot`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem(
          "reglayer-gdpr-consent",
          JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: "2026-01-01T00:00:00.000Z" }),
        );
      });
      await page.goto(path);
      await settle(page);
      await expect(page).toHaveScreenshot(`mobile-${name}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.02,
      });
    });
  }
});
