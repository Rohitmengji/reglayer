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
 *
 * Reliability:
 * Serverless Chromium cold-launches are flaky — they frequently die with
 * "Target.createTarget: Target closed" under memory pressure. launchBrowser()
 * therefore retries with backoff and bounds each attempt with a timeout, so a
 * single transient crash no longer aborts a whole audit. The serverless wrapper
 * exposes BOTH newContext() and a top-level newPage() (the scan pipeline calls
 * browser.newPage() directly) — keeping them in sync is essential, because a
 * missing newPage() silently kills every page scan in production.
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

/** Per-attempt launch timeout — a hung launch must not stall the whole audit. */
const LAUNCH_TIMEOUT_MS = 30_000;
/** Number of launch attempts before giving up. */
const LAUNCH_ATTEMPTS = 3;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/** True for the transient Chromium failures that a relaunch typically fixes. */
export function isTransientBrowserError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /Target closed|Target\.createTarget|Protocol error|Session closed|Connection closed|browser has disconnected|Navigation failed because browser has disconnected|spawn|ECONNREFUSED|socket hang up|timed? ?out/i.test(
    msg
  );
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Build the puppeteer "page-with-context" used by the serverless wrapper.
 * The page is the raw puppeteer page (so the scanner's puppeteer-specific casts
 * keep working) with a Playwright-compatible `context()` attached for the auth
 * path (addCookies / setExtraHTTPHeaders / setHTTPCredentials).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function makeServerlessContext(browser: any, options?: Record<string, unknown>) {
  const incognito = await browser.createBrowserContext();
  const page = await incognito.newPage();

  await page.setUserAgent((options?.userAgent as string) || UA);
  const vp = (options?.viewport as { width: number; height: number }) || VIEWPORT;
  await page.setViewport(vp);

  let extraHeaders: Record<string, string> = {};

  const ctx = {
    newPage: async () => page,
    close: async () => { try { await incognito.close(); } catch { /* best-effort */ } },
    // Read the REAL cookies the browser holds (not an addCookies cache), so an
    // authenticated session can be exported and reused for the scan phase.
    cookies: async () => {
      try {
        const real = await page.cookies();
        return (real as Array<Record<string, unknown>>).map((c) => ({
          name: c.name, value: c.value, domain: c.domain, path: c.path,
          expires: c.expires, httpOnly: c.httpOnly, secure: c.secure,
        }));
      } catch {
        return [];
      }
    },
    addCookies: async (cookies: Array<Record<string, unknown>>) => {
      const mapped = cookies.map((c) => ({
        name: String(c.name),
        value: String(c.value),
        domain: String(c.domain),
        path: String(c.path || "/"),
        ...(c.expires ? { expires: Number(c.expires) } : {}),
        httpOnly: Boolean(c.httpOnly),
        secure: Boolean(c.secure),
      }));
      if (mapped.length) await page.setCookie(...mapped);
    },
    setExtraHTTPHeaders: async (headers: Record<string, string>) => {
      extraHeaders = { ...extraHeaders, ...headers };
      await page.setExtraHTTPHeaders(extraHeaders);
    },
    setHTTPCredentials: async (credentials: { username: string; password: string }) => {
      await page.authenticate(credentials);
    },
  };

  // Expose the Playwright-compatible context on the page for code that calls
  // page.context() (e.g. the auth applier). Overrides puppeteer's own context().
  page.context = () => ctx;
  return { ctx, page };
}

/**
 * Wrap a raw puppeteer browser to match the Playwright Browser surface the scan
 * pipeline uses: BOTH newContext() (crawler discovery) AND a top-level newPage()
 * (runAccessibilityScan + screenshot capture call browser.newPage() directly).
 *
 * Exported and dependency-free of the actual launch so it can be unit-tested
 * with a fake puppeteer browser — a regression here silently kills EVERY page
 * scan in production (the newPage()-missing bug), so it must stay covered.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapServerlessBrowser(browser: any): Browser {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrapped: any = {
    newContext: async (options?: Record<string, unknown>) =>
      (await makeServerlessContext(browser, options)).ctx,
    newPage: async (options?: Record<string, unknown>) =>
      (await makeServerlessContext(browser, options)).page,
    isConnected: () => browser.connected,
    close: async () => { try { await browser.close(); } catch { /* best-effort */ } },
  };
  return wrapped as Browser;
}

/** One launch attempt (no retry). */
async function launchOnce(): Promise<Browser> {
  if (IS_SERVERLESS) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = (await import("puppeteer-core")).default;

    // Serverless Chromium launch hardening (the "Target.createTarget: Target
    // closed" crash on Vercel):
    //  - Drop --single-process / --no-zygote: on recent Chromium (140+) these
    //    crash the browser immediately on first target creation under Lambda.
    //    Running multi-process is stable (the matching memory bump in
    //    vercel.json gives it room).
    //  - Add --disable-dev-shm-usage: Lambda's /dev/shm is ~64 MB; without it
    //    Chromium exhausts shared memory and dies on startup.
    const filtered = chromium.args.filter(
      (a) => a !== "--single-process" && a !== "--no-zygote"
    );
    const args = filtered.includes("--disable-dev-shm-usage")
      ? filtered
      : [...filtered, "--disable-dev-shm-usage"];

    const browser = await puppeteer.launch({
      args,
      defaultViewport: VIEWPORT,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    return wrapServerlessBrowser(browser);
  }

  const { chromium } = await import("playwright");
  return chromium.launch({
    headless: true,
    args: ["--disable-gpu", "--no-sandbox"],
  });
}

/**
 * Launch a browser appropriate for the environment, with retry + per-attempt
 * timeout. Returns a Playwright Browser locally; in serverless, a puppeteer
 * browser wrapped to match the interface used by the scan pipeline.
 *
 * Retries transient Chromium failures (the "Target closed" cold-launch crash)
 * with exponential backoff; a non-transient error fails fast.
 */
export async function launchBrowser(): Promise<Browser> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < LAUNCH_ATTEMPTS; attempt++) {
    try {
      return await withTimeout(launchOnce(), LAUNCH_TIMEOUT_MS, "Browser launch");
    } catch (err) {
      lastErr = err;
      // A non-transient failure (bad config, missing binary) won't fix itself.
      if (!isTransientBrowserError(err) && !/timed out/i.test(err instanceof Error ? err.message : "")) {
        break;
      }
      if (attempt < LAUNCH_ATTEMPTS - 1) await delay(500 * 2 ** attempt); // 500ms, 1s
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Browser launch failed");
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
