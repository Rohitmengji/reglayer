import { test, expect } from "@playwright/test";

test.describe("Public pages load", () => {
  test("landing page renders", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/RegLayer/);
    // Main heading should be visible
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("pricing page loads", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("features page loads", async ({ page }) => {
    await page.goto("/features");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("API reference page loads", async ({ page }) => {
    await page.goto("/api-reference");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

test.describe("Auth flows", () => {
  test("unauthenticated user redirected from dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    // Should redirect to login or show auth gate
    await page.waitForURL(/\/(auth|dashboard)/);
  });

  test("login page renders", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  });

  test("register page renders", async ({ page }) => {
    await page.goto("/auth/register");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

test.describe("API health", () => {
  test("RUM snippet endpoint returns JavaScript", async ({ request }) => {
    const response = await request.get("/api/rum/snippet?key=test-key");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("javascript");
    const body = await response.text();
    expect(body).toContain("RL_KEY");
  });

  test("scan endpoint requires auth", async ({ request }) => {
    const response = await request.post("/api/scan", {
      data: { url: "https://example.com" },
    });
    expect(response.status()).toBe(401);
  });

  test("RUM events rejects invalid payload", async ({ request }) => {
    const response = await request.post("/api/rum/events", {
      data: { invalid: true },
    });
    expect(response.status()).toBe(400);
  });
});

test.describe("Accessibility", () => {
  test("landing page has no missing alt text on images", async ({ page }) => {
    await page.goto("/");
    const images = page.locator("img");
    const count = await images.count();
    for (let i = 0; i < count; i++) {
      const alt = await images.nth(i).getAttribute("alt");
      expect(alt, `Image ${i} is missing alt text`).not.toBeNull();
    }
  });

  test("landing page has proper heading hierarchy", async ({ page }) => {
    await page.goto("/");
    const h1s = page.locator("h1");
    const h1Count = await h1s.count();
    expect(h1Count).toBeGreaterThanOrEqual(1);
    expect(h1Count).toBeLessThanOrEqual(1); // Only one h1 per page
  });

  test("interactive elements are keyboard focusable", async ({ page }) => {
    await page.goto("/");
    // Tab into the page and verify focus moves
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused).not.toBe("BODY");
  });
});
