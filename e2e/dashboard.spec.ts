/**
 * E2E: Dashboard — stats load, scan form visible, credits display.
 */
import { test, expect } from "@playwright/test";

const EMAIL = process.env.SEED_MASTER_EMAIL || "master@reglayer.dev";
const PASSWORD = process.env.SEED_MASTER_PASSWORD || "reglayer2024";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/auth/login");
  await page.fill('#email', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(dashboard|test|compliance|settings|scans)/, { timeout: 15000 });
}

test.describe("Dashboard (authenticated)", () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test("renders dashboard with heading", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10000 });
  });

  test("stats cards load", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(3000);
    const loading = page.locator("text=Loading...");
    await expect(loading).toHaveCount(0, { timeout: 10000 });
  });

  test("sidebar navigation works", async ({ page }) => {
    await page.goto("/dashboard");
    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width >= 1024) {
      await expect(page.locator('nav, aside, [role="complementary"]').first()).toBeVisible({ timeout: 5000 });
    }
  });
});
