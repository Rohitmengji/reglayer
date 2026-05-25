/**
 * ---------------------------------------------------------
 * RegLayer — Screenshot Capture
 * ---------------------------------------------------------
 *
 * Purpose:
 * Captures page screenshots as visual evidence for
 * compliance reports.
 *
 * Why this exists:
 * Visual evidence is critical for:
 * - Audit documentation
 * - Before/after comparisons
 * - Stakeholder communication
 * - Legal compliance records
 *
 * Engineering Notes:
 * - Returns base64 encoded PNG
 * - Full page and viewport options
 * - Can highlight specific elements
 * ---------------------------------------------------------
 */

import type { Browser } from "playwright-core";
import { SCAN_DEFAULTS } from "@/lib/constants";
import { launchBrowser } from "@/lib/scanner/browser/launch";

export interface ScreenshotOptions {
  fullPage?: boolean;
  selector?: string;
  timeout?: number;
}

export interface ScreenshotResult {
  data: string; // base64 encoded PNG
  width: number;
  height: number;
  timestamp: string;
}

/**
 * Capture a screenshot of the target URL.
 */
export async function captureScreenshot(
  url: string,
  options: ScreenshotOptions = {}
): Promise<ScreenshotResult> {
  let browser: Browser | null = null;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });

    await page.goto(url, {
      waitUntil: "load",
      timeout: options.timeout ?? SCAN_DEFAULTS.timeout,
    });
    await page.waitForTimeout(2000);

    let screenshot: Buffer;

    if (options.selector) {
      const element = await page.$(options.selector);
      if (element) {
        screenshot = await element.screenshot({ type: "png" });
      } else {
        screenshot = await page.screenshot({
          type: "png",
          fullPage: options.fullPage ?? false,
        });
      }
    } else {
      screenshot = await page.screenshot({
        type: "png",
        fullPage: options.fullPage ?? false,
      });
    }

    const viewport = page.viewportSize();

    return {
      data: screenshot.toString("base64"),
      width: viewport?.width ?? 1280,
      height: viewport?.height ?? 720,
      timestamp: new Date().toISOString(),
    };
  } finally {
    if (browser) await browser.close();
  }
}
