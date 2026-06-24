/**
 * E2E: Compliance — matrix page loads, jurisdictions tab accessible.
 */
import { test, expect } from "../helpers/auth";

test.describe("Compliance (authenticated)", () => {
  test("compliance matrix loads", async ({ authedPage: page }) => {
    await page.goto("/compliance?tab=matrix");
    await page.waitForTimeout(3000);
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test("jurisdictions tab loads", async ({ authedPage: page }) => {
    await page.goto("/compliance?tab=jurisdictions");
    await page.waitForTimeout(3000);
    // Should show jurisdiction cards or scan selector
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(100);
  });
});
