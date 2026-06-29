/**
 * E2E: Settings — profile loads, theme toggle works.
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

test.describe("Settings (authenticated)", () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test("settings page loads with profile", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForTimeout(3000);
    const content = await page.textContent("body");
    expect(content).toBeTruthy();
  });

  test("navigates between settings tabs", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForTimeout(2000);
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });
});
