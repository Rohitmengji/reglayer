import { describe, expect, it } from "vitest";
import {
  normalizeUrl,
  isSameOrigin,
  matchesPatterns,
  shouldSkipUrl,
} from "@/lib/scanner/crawler/url-utils";

describe("crawler URL normalization", () => {
  it("drops the fragment so #anchors are not crawled as separate pages", () => {
    expect(normalizeUrl("https://ex.test/a#top")).toBe("https://ex.test/a");
    expect(normalizeUrl("https://ex.test/a#top")).toBe(normalizeUrl("https://ex.test/a#bottom"));
  });

  it("removes a trailing slash except on root", () => {
    expect(normalizeUrl("https://ex.test/a/")).toBe("https://ex.test/a");
    expect(normalizeUrl("https://ex.test/")).toBe("https://ex.test/");
  });

  it("lower-cases scheme and host (WHATWG) so casing cannot fork a page", () => {
    expect(normalizeUrl("HTTPS://EX.TEST/a")).toBe("https://ex.test/a");
  });

  it("orders query parameters so parameter order cannot fork a page", () => {
    expect(normalizeUrl("https://ex.test/a?b=2&a=1")).toBe(normalizeUrl("https://ex.test/a?a=1&b=2"));
  });

  it("strips tracking parameters that do not change the rendered page", () => {
    const canonical = normalizeUrl("https://ex.test/a");
    for (const q of [
      "utm_source=x", "utm_medium=y", "utm_campaign=z", "gclid=1",
      "fbclid=2", "msclkid=3", "mc_cid=4", "igshid=5", "_ga=6",
    ]) {
      expect(normalizeUrl(`https://ex.test/a?${q}`)).toBe(canonical);
    }
  });

  it("keeps meaningful query parameters", () => {
    expect(normalizeUrl("https://ex.test/search?q=wcag")).toBe("https://ex.test/search?q=wcag");
    expect(normalizeUrl("https://ex.test/p?page=2&utm_source=x")).toBe("https://ex.test/p?page=2");
  });

  it("strips framework data params that return a payload, not a page", () => {
    expect(normalizeUrl("https://ex.test/a?_rsc=abc")).toBe("https://ex.test/a");
    expect(normalizeUrl("https://ex.test/a?__nextDataReq=1")).toBe("https://ex.test/a");
  });

  it("treats the same page reached different ways as one dedupe key", () => {
    const seen = new Set(
      [
        "https://ex.test/pricing/",
        "https://ex.test/pricing#plans",
        "https://ex.test/pricing?utm_source=newsletter",
        "https://ex.test/pricing/?fbclid=abc",
      ].map(normalizeUrl),
    );
    expect(seen.size).toBe(1);
  });

  it("returns the input unchanged when it is not a parseable URL", () => {
    expect(normalizeUrl("not a url")).toBe("not a url");
  });
});

describe("crawler origin boundary", () => {
  it("keeps the crawl on the same origin", () => {
    expect(isSameOrigin("https://ex.test/a", "https://ex.test")).toBe(true);
  });

  it("rejects a different host, scheme, or port", () => {
    expect(isSameOrigin("https://evil.test/a", "https://ex.test")).toBe(false);
    expect(isSameOrigin("http://ex.test/a", "https://ex.test")).toBe(false);
    expect(isSameOrigin("https://ex.test:8443/a", "https://ex.test")).toBe(false);
  });

  it("treats a subdomain as a different origin", () => {
    expect(isSameOrigin("https://blog.ex.test/a", "https://ex.test")).toBe(false);
  });

  it("rejects unparseable URLs rather than defaulting to allowed", () => {
    expect(isSameOrigin("javascript:alert(1)", "https://ex.test")).toBe(false);
    expect(isSameOrigin("", "https://ex.test")).toBe(false);
  });
});

describe("crawler skip rules", () => {
  it("skips binary/asset extensions", () => {
    for (const u of ["https://ex.test/f.pdf", "https://ex.test/i.png", "https://ex.test/s.css", "https://ex.test/b.js"]) {
      expect(shouldSkipUrl(u)).toBe(true);
    }
  });

  it("skips framework and API paths", () => {
    expect(shouldSkipUrl("https://ex.test/api/users")).toBe(true);
    expect(shouldSkipUrl("https://ex.test/_next/static/x")).toBe(true);
    expect(shouldSkipUrl("https://ex.test/favicon.ico")).toBe(true);
  });

  it("does not skip ordinary pages", () => {
    expect(shouldSkipUrl("https://ex.test/pricing")).toBe(false);
  });

  it("skips anything unparseable rather than attempting to fetch it", () => {
    expect(shouldSkipUrl("not a url")).toBe(true);
  });
});

describe("crawler include/exclude patterns", () => {
  it("allows everything when no patterns are given", () => {
    expect(matchesPatterns("https://ex.test/a")).toBe(true);
  });

  it("applies exclude before include", () => {
    expect(matchesPatterns("https://ex.test/admin/x", ["/admin"], ["/admin"])).toBe(false);
  });

  it("requires a match when include patterns are given", () => {
    expect(matchesPatterns("https://ex.test/docs/a", ["/docs"])).toBe(true);
    expect(matchesPatterns("https://ex.test/blog/a", ["/docs"])).toBe(false);
  });
});
