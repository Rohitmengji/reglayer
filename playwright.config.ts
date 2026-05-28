/**
 * RegLayer — Playwright E2E Test Configuration
 *
 * WHY: End-to-end tests need browser configuration and dev server settings.
 * WHAT: Configures Playwright: browsers (chromium), base URL, retries, screenshots on failure.
 * HOW: Starts Next.js dev server, runs tests in e2e/ directory against localhost:3000.
 */
import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E test configuration for RegLayer.
 *
 * Run: npx playwright test
 * UI:  npx playwright test --ui
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 30000,
      },
});
