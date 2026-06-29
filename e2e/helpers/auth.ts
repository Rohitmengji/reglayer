/**
 * Shared auth helper — logs in once per worker, reuses session via storageState.
 */
import { test as base, expect, type Page } from "@playwright/test";

const EMAIL = process.env.SEED_MASTER_EMAIL || "master@reglayer.dev";
const PASSWORD = process.env.SEED_MASTER_PASSWORD || "reglayer2024";

export async function login(page: Page) {
  await page.goto("/auth/login");
  await page.fill('input[name="email"], input[type="email"], #email', EMAIL);
  await page.fill('input[name="password"], input[type="password"], #password', PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  // Wait for redirect to dashboard or any authenticated page
  await page.waitForURL(/\/(dashboard|test|compliance|settings)/, { timeout: 15000 });
}

/** Test fixture with authenticated page. */
export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    await login(page);
    // `use` is Playwright's fixture-provider callback, not React 19's use() hook —
    // the rules-of-hooks heuristic only matches it by name.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
  },
});

export { expect };
