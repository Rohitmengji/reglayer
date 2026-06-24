/**
 * E2E: Testing hub — scans tab loads, scan form functional.
 */
import { test, expect } from "../helpers/auth";

test.describe("Testing Hub (authenticated)", () => {
  test("scans tab loads", async ({ authedPage: page }) => {
    await page.goto("/test?tab=scans");
    await page.waitForTimeout(3000);
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test("scan form accepts URL input", async ({ authedPage: page }) => {
    await page.goto("/test?tab=scans");
    const urlInput = page.locator('input[placeholder*="url" i], input[type="url"]').first();
    await expect(urlInput).toBeVisible({ timeout: 10000 });
    await urlInput.fill("https://example.com");
    const value = await urlInput.inputValue();
    expect(value).toBe("https://example.com");
  });
});
