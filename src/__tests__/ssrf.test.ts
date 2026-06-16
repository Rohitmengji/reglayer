import { describe, it, expect } from "vitest";
import { validateScanUrl } from "@/lib/validations/ssrf";

describe("validateScanUrl", () => {
  it("allows normal public http/https URLs", () => {
    expect(validateScanUrl("https://example.com/")).toBeNull();
    expect(validateScanUrl("http://books.toscrape.com/catalogue/page-2.html")).toBeNull();
    expect(validateScanUrl("https://sub.example.co.uk:8443/path")).toBeNull();
  });

  it("blocks dotted-decimal private/loopback/link-local IPv4", () => {
    for (const u of [
      "http://127.0.0.1/",
      "http://10.0.0.1/",
      "http://172.16.0.1/",
      "http://192.168.1.1/",
      "http://169.254.169.254/", // cloud metadata
      "http://0.0.0.0/",
      "http://100.64.0.1/", // CGNAT
    ]) {
      expect(validateScanUrl(u), u).toMatch(/internal|private/i);
    }
  });

  it("blocks decimal/hex IPv4 encodings (canonicalized by URL parser)", () => {
    expect(validateScanUrl("http://2130706433/")).toMatch(/private|internal/i); // 127.0.0.1
    expect(validateScanUrl("http://0x7f000001/")).toMatch(/private|internal/i); // 127.0.0.1
    expect(validateScanUrl("http://2852039166/")).toMatch(/private|internal/i); // 169.254.169.254
  });

  it("blocks BRACKETED IPv6 internal addresses (the confirmed bypass)", () => {
    for (const u of [
      "http://[::1]/",                  // loopback — was bypassing
      "http://[0:0:0:0:0:0:0:1]/",      // expanded loopback
      "http://[fe80::1]/",              // link-local
      "http://[fc00::1]/",              // ULA
      "http://[fd12:3456::1]/",         // ULA
      "http://[::ffff:127.0.0.1]/",     // IPv4-mapped loopback
      "http://[::ffff:169.254.169.254]/", // IPv4-mapped metadata
    ]) {
      expect(validateScanUrl(u), u).toMatch(/internal|private/i);
    }
  });

  it("blocks internal hostnames", () => {
    expect(validateScanUrl("http://localhost/")).toMatch(/internal/i);
    expect(validateScanUrl("http://metadata.google.internal/")).toMatch(/internal/i);
    expect(validateScanUrl("http://ip6-localhost/")).toMatch(/internal/i);
  });

  it("rejects non-http(s) protocols and garbage", () => {
    expect(validateScanUrl("ftp://example.com/")).toMatch(/HTTP/i);
    expect(validateScanUrl("file:///etc/passwd")).toMatch(/HTTP/i);
    expect(validateScanUrl("not a url")).toMatch(/Invalid/i);
  });

  it("blocks internal service ports", () => {
    expect(validateScanUrl("http://example.com:5432/")).toMatch(/port/i);
    expect(validateScanUrl("http://example.com:6379/")).toMatch(/port/i);
    expect(validateScanUrl("http://example.com:9200/")).toMatch(/port/i);
  });

  it("does not block normal ports", () => {
    expect(validateScanUrl("https://example.com:8443/")).toBeNull();
    expect(validateScanUrl("http://example.com:8080/")).toBeNull();
  });
});
