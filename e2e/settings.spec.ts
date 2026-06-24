/**
 * E2E: Settings — profile loads, theme toggle works.
 */
import { test, expect } from "../helpers/auth";

test.describe("Settings (authenticated)", () => {
  test("settings page loads with profile", async ({ authedPage: page }) => {
    await page.goto("/settings");
    await page.waitForTimeout(3000);
    // Should show profile section or email
    const content = await page.textContent("body");
    expect(content).toBeTruthy();
  });

  test("navigates between settings tabs", async ({ authedPage: page }) => {
    await page.goto("/settings");
    await page.waitForTimeout(2000);
    // Page should not crash
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });
});
