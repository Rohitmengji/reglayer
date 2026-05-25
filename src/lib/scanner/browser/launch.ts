/**
 * ---------------------------------------------------------
 * RegLayer — Browser Launch Utility
 * ---------------------------------------------------------
 *
 * Purpose:
 * Centralized browser launching that works in both
 * local dev and serverless (Vercel) environments.
 * ---------------------------------------------------------
 */

import type { Browser } from "playwright-core";

const IS_SERVERLESS = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

/**
 * Launch a browser instance appropriate for the current environment.
 */
export async function launchBrowser(): Promise<Browser> {
  if (IS_SERVERLESS) {
    const { chromium } = await import("playwright-core");
    const sparticuzChromium = (await import("@sparticuz/chromium")).default;
    (sparticuzChromium as unknown as { setHeadlessMode: string }).setHeadlessMode = "shell";
    (sparticuzChromium as unknown as { setGraphicsMode: boolean }).setGraphicsMode = false;

    const executablePath = await sparticuzChromium.executablePath();

    return chromium.launch({
      executablePath,
      headless: true,
      args: sparticuzChromium.args,
    });
  }

  const { chromium } = await import("playwright");
  return chromium.launch({ headless: true });
}
