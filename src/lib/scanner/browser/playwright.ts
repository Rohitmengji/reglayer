/**
 * ---------------------------------------------------------
 * RegLayer — Playwright Browser Manager
 * ---------------------------------------------------------
 *
 * Purpose:
 * Manages browser lifecycle for the scanning infrastructure.
 *
 * Why this exists:
 * Browser instances are expensive resources.
 * This module provides controlled lifecycle management
 * to prevent resource leaks and enable pooling.
 *
 * Future Extensions:
 * - Browser pool for concurrent scans
 * - Warm browser instances
 * - Context isolation per scan
 * ---------------------------------------------------------
 */

import type { Browser, BrowserContext, Page } from "playwright-core";
import { launchBrowser } from "@/lib/scanner/browser/launch";

let browserInstance: Browser | null = null;

/**
 * Get or create a shared browser instance.
 *
 * In development: creates fresh instance per request.
 * In production (future): managed pool with warm instances.
 */
export async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await launchBrowser();
  }
  return browserInstance;
}

/**
 * Create an isolated browser context.
 *
 * Each scan operation should use its own context
 * to prevent cookie/storage cross-contamination.
 */
export async function createIsolatedContext(
  browser: Browser
): Promise<BrowserContext> {
  return browser.newContext({
    ignoreHTTPSErrors: true,
    javaScriptEnabled: true,
  });
}

/**
 * Create a page within a context.
 */
export async function createPage(context: BrowserContext): Promise<Page> {
  return context.newPage();
}

/**
 * Clean up browser resources.
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
