/**
 * RegLayer — Crawl error handling tests
 *
 * WHY: A real product must never surface raw "Target.createTarget: Target closed"
 *      to a user, and must retry the transient Chromium crashes that a relaunch
 *      fixes (vs. failing fast on genuine config errors). Both decisions are made
 *      by these two pure helpers.
 * WHAT: humanizeCrawlError (raw → friendly) and isTransientBrowserError (retry?).
 */
import { describe, it, expect } from "vitest";
import { humanizeCrawlError } from "@/lib/scanner/crawler/crawlErrors";
import { isTransientBrowserError } from "@/lib/scanner/browser/launch";

describe("humanizeCrawlError", () => {
  it("never leaks raw Chromium internals for the Target-closed crash", () => {
    const out = humanizeCrawlError("Protocol error (Target.createTarget): Target closed");
    expect(out).not.toMatch(/Target\.createTarget|Protocol error/i);
    expect(out.toLowerCase()).toContain("resources");
  });

  it("maps common failure classes to actionable guidance", () => {
    expect(humanizeCrawlError("net::ERR_NAME_NOT_RESOLVED")).toMatch(/resolve|URL/i);
    expect(humanizeCrawlError("Navigation timeout of 30000 ms exceeded")).toMatch(/too long|fewer pages/i);
    expect(humanizeCrawlError("Request failed with status 403 Forbidden")).toMatch(/blocked/i);
    expect(humanizeCrawlError("Scanning internal addresses is not allowed")).toMatch(/public URL/i);
    expect(humanizeCrawlError("No scannable pages discovered")).toMatch(/pages to scan/i);
  });

  it("uses the auth-phase message when phase is auth", () => {
    expect(humanizeCrawlError("redirected to login", "auth")).toMatch(/sign in|credentials/i);
  });

  it("always returns a non-empty, human sentence (never empty/raw) for unknown errors", () => {
    const out = humanizeCrawlError("something totally unexpected blew up");
    expect(out.length).toBeGreaterThan(10);
    expect(out).toMatch(/try again/i);
  });

  it("handles empty/garbage input safely", () => {
    expect(humanizeCrawlError("")).toBeTruthy();
    // @ts-expect-error — defensive against non-string at runtime
    expect(humanizeCrawlError(undefined)).toBeTruthy();
  });
});

describe("isTransientBrowserError", () => {
  it("flags the transient Chromium crashes a relaunch fixes", () => {
    for (const msg of [
      "Protocol error (Target.createTarget): Target closed",
      "Target closed",
      "Session closed. Most likely the page has been closed.",
      "Navigation failed because browser has disconnected!",
      "spawn ETXTBSY",
      "socket hang up",
      "connect ECONNREFUSED",
      "Browser launch timed out after 30000ms",
    ]) {
      expect(isTransientBrowserError(new Error(msg))).toBe(true);
    }
  });

  it("does NOT retry genuine, non-transient errors", () => {
    for (const msg of [
      "Executable doesn't exist at /path/to/chromium",
      "Invalid URL",
      "TypeError: x is not a function",
    ]) {
      expect(isTransientBrowserError(new Error(msg))).toBe(false);
    }
  });

  it("accepts non-Error inputs without throwing", () => {
    expect(isTransientBrowserError("Target closed")).toBe(true);
    expect(isTransientBrowserError(null)).toBe(false);
    expect(isTransientBrowserError(undefined)).toBe(false);
  });
});
