/**
 * ---------------------------------------------------------
 * RegLayer — Browser Launch Utility
 * ---------------------------------------------------------
 *
 * Purpose:
 * Centralized browser launching that works in both
 * local dev and serverless (Vercel) environments.
 *
 * Strategy:
 * - Local: Full Playwright with locally installed Chromium
 * - Serverless: puppeteer-core + @sparticuz/chromium
 *   (proven combination for Vercel/Lambda)
 * ---------------------------------------------------------
 */

import type { Browser } from "playwright-core";

const IS_SERVERLESS = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

/**
 * Standard viewport for consistent scan results across environments.
 * 1280x720 represents a common desktop resolution and ensures
 * responsive breakpoints are evaluated consistently.
 */
const VIEWPORT = { width: 1280, height: 720 };

/**
 * Launch a browser instance appropriate for the current environment.
 *
 * Returns a Playwright Browser in local dev.
 * In serverless, returns a puppeteer browser wrapped to match the interface
 * used by the scan pipeline (we only use newPage, goto, evaluate, close).
 */
export async function launchBrowser(): Promise<Browser> {
  if (IS_SERVERLESS) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = (await import("puppeteer-core")).default;

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: VIEWPORT,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    // Wrap puppeteer browser to provide Playwright-compatible newContext()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped: any = {
      newContext: async (options?: Record<string, unknown>) => {
        const incognito = await browser.createBrowserContext();
        const page = await incognito.newPage();

        if (options?.userAgent) {
          await page.setUserAgent(options.userAgent as string);
        }
        if (options?.viewport) {
          const vp = options.viewport as { width: number; height: number };
          await page.setViewport(vp);
        }

        // Track cookies for Playwright API compat
        let storedCookies: Array<Record<string, unknown>> = [];
        let extraHeaders: Record<string, string> = {};

        return {
          newPage: async () => page,
          close: async () => { await incognito.close(); },
          cookies: async () => storedCookies,
          addCookies: async (cookies: Array<Record<string, unknown>>) => {
            storedCookies = cookies;
            const mapped = cookies.map(c => ({
              name: String(c.name),
              value: String(c.value),
              domain: String(c.domain),
              path: String(c.path || "/"),
              ...(c.expires ? { expires: Number(c.expires) } : {}),
              httpOnly: Boolean(c.httpOnly),
              secure: Boolean(c.secure),
            }));
            await page.setCookie(...mapped);
          },
          setExtraHTTPHeaders: async (headers: Record<string, string>) => {
            extraHeaders = { ...extraHeaders, ...headers };
            await page.setExtraHTTPHeaders(extraHeaders);
          },
          setHTTPCredentials: async (credentials: { username: string; password: string }) => {
            await page.authenticate(credentials);
          },
        };
      },
      isConnected: () => browser.connected,
      close: async () => { await browser.close(); },
    };

    return wrapped as Browser;
  }

  const { chromium } = await import("playwright");
  return chromium.launch({
    headless: true,
    args: ["--disable-gpu", "--no-sandbox"],
  });
}

/**
 * Check if we're running in serverless mode.
 * Used by scan code to adapt behavior.
 */
export function isServerless(): boolean {
  return IS_SERVERLESS;
}

/**
 * Get the standard viewport dimensions.
 */
export function getViewport() {
  return VIEWPORT;
}
