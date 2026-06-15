/**
 * RegLayer — Serverless browser wrapper tests
 *
 * WHY: In production (Vercel) the scanner runs against a puppeteer browser
 *      wrapped to look like Playwright. A regression where the wrapper omits a
 *      top-level newPage() silently kills EVERY page scan in production while
 *      local dev (real Playwright) stays green — the exact bug that made the
 *      crawl "fail on every page". This test launches no real browser; it feeds
 *      a fake puppeteer browser through wrapServerlessBrowser and asserts the
 *      shape the scan pipeline depends on.
 */
import { describe, it, expect, vi } from "vitest";
import { wrapServerlessBrowser } from "@/lib/scanner/browser/launch";

function makeFakePuppeteerBrowser() {
  const page = {
    setUserAgent: vi.fn(async () => {}),
    setViewport: vi.fn(async () => {}),
    setCookie: vi.fn(async () => {}),
    setExtraHTTPHeaders: vi.fn(async () => {}),
    authenticate: vi.fn(async () => {}),
    cookies: vi.fn(async () => [
      { name: "session", value: "abc", domain: "example.com", path: "/", expires: -1, httpOnly: true, secure: true },
    ]),
    // puppeteer pages have their own context(); the wrapper must override it.
    context: () => ({ __raw: true }),
  };
  const incognito = { newPage: vi.fn(async () => page), close: vi.fn(async () => {}) };
  const browser = {
    createBrowserContext: vi.fn(async () => incognito),
    connected: true,
    close: vi.fn(async () => {}),
  };
  return { browser, incognito, page };
}

describe("wrapServerlessBrowser", () => {
  it("exposes a top-level newPage() that returns a usable page (the prod-killing bug)", async () => {
    const { browser } = makeFakePuppeteerBrowser();
    const wrapped = wrapServerlessBrowser(browser) as unknown as {
      newPage: (o?: Record<string, unknown>) => Promise<unknown>;
    };
    expect(typeof wrapped.newPage).toBe("function");
    const page = await wrapped.newPage();
    expect(page).toBeTruthy();
  });

  it("newPage() returns a page whose context() is Playwright-compatible (auth path)", async () => {
    const { browser } = makeFakePuppeteerBrowser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = wrapServerlessBrowser(browser) as any;
    const page = await wrapped.newPage();
    const ctx = page.context();
    // applyAuthToContext relies on these existing on the context:
    expect(typeof ctx.addCookies).toBe("function");
    expect(typeof ctx.setExtraHTTPHeaders).toBe("function");
    expect(typeof ctx.setHTTPCredentials).toBe("function");
    expect(ctx.__raw).toBeUndefined(); // overrode puppeteer's raw context()
  });

  it("newContext().newPage() also works (crawler discovery path)", async () => {
    const { browser } = makeFakePuppeteerBrowser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = wrapServerlessBrowser(browser) as any;
    const ctx = await wrapped.newContext({ viewport: { width: 1280, height: 720 } });
    expect(typeof ctx.newPage).toBe("function");
    const page = await ctx.newPage();
    expect(page).toBeTruthy();
  });

  it("cookies() exports the REAL browser cookies (so an authed session can be reused)", async () => {
    const { browser, page } = makeFakePuppeteerBrowser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = wrapServerlessBrowser(browser) as any;
    const ctx = await wrapped.newContext();
    const cookies = await ctx.cookies();
    expect(page.cookies).toHaveBeenCalled();
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatchObject({ name: "session", value: "abc", domain: "example.com" });
  });

  it("addCookies maps to puppeteer setCookie, and setHTTPCredentials authenticates", async () => {
    const { browser, page } = makeFakePuppeteerBrowser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = wrapServerlessBrowser(browser) as any;
    const ctx = await wrapped.newContext();
    await ctx.addCookies([{ name: "a", value: "1", domain: "x.com" }]);
    expect(page.setCookie).toHaveBeenCalledWith(expect.objectContaining({ name: "a", value: "1", domain: "x.com", path: "/" }));
    await ctx.setHTTPCredentials({ username: "u", password: "p" });
    expect(page.authenticate).toHaveBeenCalledWith({ username: "u", password: "p" });
  });

  it("isConnected reflects the underlying browser and close() never throws", async () => {
    const { browser } = makeFakePuppeteerBrowser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = wrapServerlessBrowser(browser) as any;
    expect(wrapped.isConnected()).toBe(true);
    browser.close = vi.fn(async () => { throw new Error("boom"); });
    await expect(wrapped.close()).resolves.toBeUndefined();
  });
});
