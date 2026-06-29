/**
 * E2E: Compliance — matrix page loads, jurisdictions tab accessible.
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

test.describe("Compliance (authenticated)", () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test("compliance matrix loads", async ({ page }) => {
    await page.goto("/compliance?tab=matrix");
    await page.waitForTimeout(3000);
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test("jurisdictions tab loads", async ({ page }) => {
    await page.goto("/compliance?tab=jurisdictions");
    await page.waitForTimeout(3000);
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(100);
  });
});
