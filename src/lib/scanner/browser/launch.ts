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
      defaultViewport: { width: 1280, height: 720 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    // Return puppeteer browser cast as Playwright Browser
    // Both share the same core interface we use (newPage, close)
    return browser as unknown as Browser;
  }

  const { chromium } = await import("playwright");
  return chromium.launch({ headless: true });
}

/**
 * Check if we're running in serverless mode.
 * Used by scan code to adapt behavior.
 */
export function isServerless(): boolean {
  return IS_SERVERLESS;
}
