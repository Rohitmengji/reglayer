/**
 * E2E: Public pages — all public pages load without errors, have consistent header.
 */
import { test, expect } from "@playwright/test";

const PUBLIC_PAGES = [
  { path: "/", title: /RegLayer/ },
  { path: "/pricing", title: /Pricing|RegLayer/ },
  { path: "/features", title: /Features|RegLayer/ },
  { path: "/standards", title: /Standards|RegLayer/ },
  { path: "/docs", title: /Documentation|RegLayer/ },
  { path: "/api-reference", title: /API|RegLayer/ },
  { path: "/contact", title: /Contact|RegLayer/ },
  { path: "/privacy", title: /Privacy|RegLayer/ },
  { path: "/terms", title: /Terms|RegLayer/ },
  { path: "/cookie-policy", title: /Cookie|RegLayer/ },
];

for (const { path, title } of PUBLIC_PAGES) {
  test(`${path} loads and has title`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveTitle(title);
  });
}

test("all public pages have consistent header logo", async ({ page }) => {
  for (const { path } of PUBLIC_PAGES.slice(1)) { // skip landing (has its own header)
    await page.goto(path);
    const logo = page.locator("header svg, header a svg").first();
    await expect(logo).toBeVisible({ timeout: 5000 });
  }
});

test("404 page shows for invalid routes", async ({ page }) => {
  await page.goto("/this-page-does-not-exist");
  const body = await page.textContent("body");
  expect(body).toContain("404");
});
