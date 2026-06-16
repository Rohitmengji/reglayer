import { describe, it, expect } from "vitest";
import { normalizeTargetUrl } from "@/lib/crawl-viz/targetUrl";

describe("normalizeTargetUrl", () => {
  it("rejects a bare word with no TLD (the 'google' trap)", () => {
    const r = normalizeTargetUrl("google");
    expect(r.url).toBeUndefined();
    expect(r.error).toMatch(/complete domain/i);
  });

  it("rejects empty / whitespace input", () => {
    expect(normalizeTargetUrl("").error).toBeTruthy();
    expect(normalizeTargetUrl("   ").error).toBeTruthy();
  });

  it("rejects a host with spaces", () => {
    expect(normalizeTargetUrl("my site.com").error).toMatch(/spaces/i);
  });

  it("rejects localhost and trailing-dot hosts", () => {
    expect(normalizeTargetUrl("localhost").error).toBeTruthy();
    expect(normalizeTargetUrl("example.").error).toBeTruthy();
  });

  it("rejects non-http(s) protocols", () => {
    expect(normalizeTargetUrl("ftp://example.com").error).toMatch(/https?/i);
  });

  it("accepts a bare domain and adds https://", () => {
    const r = normalizeTargetUrl("example.com");
    expect(r.error).toBeUndefined();
    expect(r.url).toBe("https://example.com/");
  });

  it("preserves an explicit https URL with a path", () => {
    const r = normalizeTargetUrl("https://books.toscrape.com/catalogue/page-2.html");
    expect(r.error).toBeUndefined();
    expect(r.url).toBe("https://books.toscrape.com/catalogue/page-2.html");
  });

  it("accepts multi-label domains and ccTLDs", () => {
    expect(normalizeTargetUrl("sub.example.co.uk").url).toBe("https://sub.example.co.uk/");
    expect(normalizeTargetUrl("www.google.com").url).toBe("https://www.google.com/");
  });

  it("accepts a raw IPv4 (SSRF is enforced server-side)", () => {
    const r = normalizeTargetUrl("93.184.216.34");
    expect(r.error).toBeUndefined();
    expect(r.url).toBe("https://93.184.216.34/");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeTargetUrl("  example.com  ").url).toBe("https://example.com/");
  });
});
