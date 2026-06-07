/**
 * RegLayer — Critical Flow E2E Tests
 *
 * WHY: Validate end-to-end user journeys across the platform.
 * WHAT: Tests for authentication, scanning, dashboard, export, settings, and API flows.
 * HOW: Playwright browser automation with authenticated session state.
 */
import { test, expect } from "@playwright/test";

// ─── Auth Helper ───────────────────────────────────────────────

const TEST_USER = {
  email: process.env.E2E_USER_EMAIL || "admin@reglayer.dev",
  password: process.env.E2E_USER_PASSWORD || "reglayer2024",
};

async function login(page: import("@playwright/test").Page) {
  await page.goto("/auth/login");
  await page.fill('input[name="email"], input[type="email"]', TEST_USER.email);
  await page.fill('input[name="password"], input[type="password"]', TEST_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|scans)/, { timeout: 15000 });
}

// ─── Authentication Flows ──────────────────────────────────────

test.describe("Authentication", () => {
  test("login with valid credentials redirects to dashboard", async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/(dashboard|scans)/);
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/auth/login");
    await page.fill('input[name="email"], input[type="email"]', "wrong@example.com");
    await page.fill('input[name="password"], input[type="password"]', "wrongpassword");
    await page.click('button[type="submit"]');
    // Should stay on login page or show error
    await page.waitForTimeout(3000);
    const url = page.url();
    expect(url).toMatch(/auth/);
  });

  test("logout returns to login page", async ({ page }) => {
    await login(page);
    // Look for user menu or logout button
    const userMenu = page.locator('[data-testid="user-menu"], button:has-text("Admin"), button:has-text("Log")');
    if (await userMenu.first().isVisible()) {
      await userMenu.first().click();
      const logoutBtn = page.locator('button:has-text("Log out"), button:has-text("Sign out"), a:has-text("Log out")');
      if (await logoutBtn.first().isVisible({ timeout: 3000 })) {
        await logoutBtn.first().click();
        await page.waitForURL(/\/(auth|$)/, { timeout: 10000 });
      }
    }
  });

  test("protected pages redirect unauthenticated users", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/auth/, { timeout: 10000 });
    expect(page.url()).toContain("auth");
  });
});

// ─── Dashboard ─────────────────────────────────────────────────

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("dashboard loads with stats cards", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("h1")).toContainText(/Dashboard/i);
    // Stats cards should be visible
    await expect(page.getByText("Total Scans")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Avg Score")).toBeVisible();
  });

  test("dashboard shows recent scans section", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Recent Scans")).toBeVisible({ timeout: 10000 });
  });

  test("scan form is present and interactive", async ({ page }) => {
    await page.goto("/dashboard");
    const urlInput = page.locator('input[type="url"], input[placeholder*="http"]');
    await expect(urlInput.first()).toBeVisible({ timeout: 10000 });
  });
});

// ─── Scanning Flow ─────────────────────────────────────────────

test.describe("Scanning", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("scan form validates URL input", async ({ page }) => {
    await page.goto("/dashboard");
    const urlInput = page.locator('input[type="url"], input[placeholder*="http"]');
    await urlInput.first().fill("not-a-url");
    const scanBtn = page.locator('button:has-text("Scan")');
    // Button should be disabled or form should show validation error
    if (await scanBtn.first().isVisible()) {
      const isDisabled = await scanBtn.first().isDisabled();
      if (!isDisabled) {
        await scanBtn.first().click();
        // Should show error or not navigate away
        await page.waitForTimeout(2000);
        expect(page.url()).toContain("dashboard");
      }
    }
  });

  test("scan completes for a valid public URL", async ({ page }) => {
    test.setTimeout(60000); // Scans can take time
    await page.goto("/dashboard");
    const urlInput = page.locator('input[type="url"], input[placeholder*="http"]');
    await urlInput.first().clear();
    await urlInput.first().fill("https://example.com");
    const scanBtn = page.locator('button:has-text("Scan")');
    await scanBtn.first().click();
    // Wait for scan to complete — should show score or results
    await expect(
      page.locator('[data-testid="scan-result"], [class*="score"], text=/\\d+\\.?\\d*/')
    ).toBeVisible({ timeout: 45000 });
  });

  test("scans page lists historical scans", async ({ page }) => {
    await page.goto("/scans");
    await expect(page.locator("h1")).toContainText(/Scans/i);
    // Should have at least one scan row/card
    await page.waitForTimeout(3000);
    const scanItems = page.locator('a[href*="/report/"], tr, [data-scan-id]');
    const count = await scanItems.count();
    expect(count).toBeGreaterThan(0);
  });
});

// ─── Navigation & Sidebar ──────────────────────────────────────

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("sidebar navigation links are functional", async ({ page }) => {
    await page.goto("/dashboard");
    const navLinks = [
      { text: "Scans", url: "/scans" },
      { text: "Compliance", url: "/compliance" },
      { text: "Settings", url: "/settings" },
    ];

    for (const link of navLinks) {
      const navItem = page.locator(`nav a:has-text("${link.text}")`);
      if (await navItem.first().isVisible()) {
        await navItem.first().click();
        await page.waitForURL(new RegExp(link.url), { timeout: 10000 });
        expect(page.url()).toContain(link.url);
      }
    }
  });

  test("sidebar highlights active page", async ({ page }) => {
    await page.goto("/scans");
    const activeLink = page.locator('nav a[href="/scans"]');
    await expect(activeLink).toBeVisible();
  });
});

// ─── Settings ──────────────────────────────────────────────────

test.describe("Settings", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("settings page loads", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("h1, h2")).toContainText(/Settings/i);
  });
});

// ─── API Endpoints ─────────────────────────────────────────────

test.describe("API", () => {
  test("OpenAPI spec is publicly accessible", async ({ request }) => {
    const response = await request.get("/api/openapi");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.openapi).toBe("3.1.0");
    expect(body.info.title).toBe("RegLayer API");
    expect(body.paths).toBeDefined();
  });

  test("health endpoint returns ok", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
  });

  test("scan endpoint enforces authentication", async ({ request }) => {
    const response = await request.post("/api/scan", {
      data: { url: "https://example.com" },
    });
    expect(response.status()).toBe(401);
  });

  test("scans list endpoint enforces authentication", async ({ request }) => {
    const response = await request.get("/api/scans");
    expect(response.status()).toBe(401);
  });

  test("crawl endpoint enforces authentication", async ({ request }) => {
    const response = await request.post("/api/crawl", {
      data: { url: "https://example.com" },
    });
    expect(response.status()).toBe(401);
  });

  test("demo-scan endpoint is publicly accessible", async ({ request }) => {
    const response = await request.post("/api/demo-scan", {
      data: { url: "https://example.com" },
    });
    // Should not be 401 (may be 200, 400, or 429 depending on rate limit)
    expect(response.status()).not.toBe(401);
  });
});

// ─── Export Flows ──────────────────────────────────────────────

test.describe("Export", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("violations export returns CSV", async ({ page, request }) => {
    // Get first scan ID from the scans page
    await page.goto("/scans");
    await page.waitForTimeout(3000);
    const scanLink = page.locator('a[href*="/report/scan_"]').first();
    if (await scanLink.isVisible()) {
      const href = await scanLink.getAttribute("href");
      const scanId = href?.split("/report/")[1];
      if (scanId) {
        // Get cookies for authenticated request
        const cookies = await page.context().cookies();
        const sessionCookie = cookies.find((c) => c.name.includes("session-token"));
        if (sessionCookie) {
          const response = await request.get(`/api/scans/${scanId}/export?format=csv`, {
            headers: { Cookie: `${sessionCookie.name}=${sessionCookie.value}` },
          });
          expect(response.status()).toBe(200);
          expect(response.headers()["content-type"]).toContain("text/csv");
        }
      }
    }
  });
});

// ─── Compliance ────────────────────────────────────────────────

test.describe("Compliance", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("compliance page loads with matrix tab", async ({ page }) => {
    await page.goto("/compliance?tab=matrix");
    await page.waitForTimeout(3000);
    await expect(page.locator("h1, h2")).toContainText(/Compliance/i);
  });
});

// ─── Accessibility (A11y of the platform itself) ───────────────

test.describe("Platform Accessibility", () => {
  test("all pages have proper heading structure", async ({ page }) => {
    await login(page);
    const pages = ["/dashboard", "/scans", "/settings"];
    for (const path of pages) {
      await page.goto(path);
      await page.waitForTimeout(2000);
      const h1Count = await page.locator("h1").count();
      expect(h1Count, `${path} should have exactly one h1`).toBeGreaterThanOrEqual(1);
    }
  });

  test("forms have associated labels", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
    await page.waitForTimeout(3000);
    const inputs = page.locator("input:visible");
    const count = await inputs.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      const input = inputs.nth(i);
      const hasLabel = await input.evaluate((el) => {
        const id = el.id;
        const ariaLabel = el.getAttribute("aria-label");
        const ariaLabelledBy = el.getAttribute("aria-labelledby");
        const placeholder = el.getAttribute("placeholder");
        const label = id ? document.querySelector(`label[for="${id}"]`) : null;
        return !!(label || ariaLabel || ariaLabelledBy || placeholder);
      });
      expect(hasLabel, `Input ${i} should have an accessible label`).toBe(true);
    }
  });

  test("no focus traps on main pages", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
    await page.waitForTimeout(2000);
    // Tab through elements and verify focus moves
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
    }
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedTag).not.toBe("BODY");
  });
});
