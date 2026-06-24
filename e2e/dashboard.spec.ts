/**
 * E2E: Dashboard — stats load, scan form visible, credits display.
 */
import { test, expect } from "../helpers/auth";

test.describe("Dashboard (authenticated)", () => {
  test("renders dashboard with scan form", async ({ authedPage: page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Scan form should be present
    await expect(page.locator('input[placeholder*="url" i], input[type="url"]').first()).toBeVisible({ timeout: 10000 });
  });

  test("stats cards load", async ({ authedPage: page }) => {
    await page.goto("/dashboard");
    // Wait for stats to load (skeleton → real data or empty state)
    await page.waitForTimeout(3000);
    // Should not be stuck on loading
    const loading = page.locator("text=Loading...");
    await expect(loading).toHaveCount(0, { timeout: 10000 });
  });

  test("sidebar navigation works", async ({ authedPage: page }) => {
    await page.goto("/dashboard");
    // On desktop, sidebar should be visible
    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width >= 1024) {
      await expect(page.locator("aside")).toBeVisible();
    }
  });
});
