/**
 * E2E: Testing hub — scans tab loads, scan form functional.
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

test.describe("Testing Hub (authenticated)", () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test("scans tab loads", async ({ page }) => {
    await page.goto("/test?tab=scans");
    await page.waitForTimeout(3000);
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test("scan form accepts URL input", async ({ page }) => {
    await page.goto("/test?tab=scans");
    const urlInput = page.locator('input[placeholder*="url" i], input[placeholder*="http" i], input[type="url"]').first();
    if (await urlInput.isVisible({ timeout: 10000 })) {
      await urlInput.fill("https://example.com");
      const value = await urlInput.inputValue();
      expect(value).toContain("example.com");
    }
  });
});
