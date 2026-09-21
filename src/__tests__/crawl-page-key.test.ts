import { describe, expect, it } from "vitest";
import { crawlPageKey, pageSnapshot, restorePageSnapshot } from "@/lib/scanner/crawler/page-checkpoint";
import type { ScanResult } from "@/lib/types";

describe("crawl page identity", () => {
  const scope = { workspaceId: "workspace-1", jobId: "audit-1", url: "https://example.com/page?view=one" };

  it("is stable across attempts and has a bounded opaque key", () => {
    expect(crawlPageKey(scope)).toBe(crawlPageKey({ ...scope }));
    expect(crawlPageKey(scope)).toMatch(/^crawl_page_[a-f0-9]{64}$/);
  });

  it("isolates workspaces and distinct crawl jobs", () => {
    expect(crawlPageKey(scope)).not.toBe(crawlPageKey({ ...scope, workspaceId: "workspace-2" }));
    expect(crawlPageKey(scope)).not.toBe(crawlPageKey({ ...scope, jobId: "audit-2" }));
  });

  it("keeps committed page identity stable across ownership generations", () => {
    const first = { ...scope, attempt: { token: "owner-one", generation: 1 } };
    const replacement = { ...scope, attempt: { token: "owner-two", generation: 2 } };
    expect(crawlPageKey(first)).toBe(crawlPageKey(replacement));
  });

  it("preserves query ordering, fragments, and trailing-slash distinctions", () => {
    for (const url of ["https://example.com/page?view=two", `${scope.url}#route`, "https://example.com/page/?view=one"]) {
      expect(crawlPageKey(scope)).not.toBe(crawlPageKey({ ...scope, url }));
    }
    expect(crawlPageKey({ ...scope, url: "https://example.com/?a=1&b=2" }))
      .not.toBe(crawlPageKey({ ...scope, url: "https://example.com/?b=2&a=1" }));
  });

  it("normalizes only URL parser equivalences", () => {
    expect(crawlPageKey({ ...scope, url: "https://EXAMPLE.com:443/page?view=one" })).toBe(crawlPageKey(scope));
  });

  it("rejects missing scope, non-web URLs, and embedded credentials", () => {
    const credentialUrl = new URL("https://example.com");
    credentialUrl.username = "user";
    credentialUrl.password = "password";
    for (const invalid of [
      { ...scope, workspaceId: "" }, { ...scope, jobId: " " },
      { ...scope, url: "file:///private" }, { ...scope, url: credentialUrl.href },
    ]) expect(() => crawlPageKey(invalid)).toThrow();
  });
});

describe("crawl checkpoint snapshot", () => {
  const scan: ScanResult = {
    id: "scan-1", url: "https://example.com", timestamp: "2026-09-21T00:00:00.000Z", status: "completed",
    summary: { totalViolations: 0, critical: 0, serious: 0, moderate: 0, minor: 0, score: 100 },
    violations: [], screenshot: "image-data",
    metadata: { scanDuration: 100, pageTitle: "Example", browserEngine: "chromium", axeCoreVersion: "4" },
  };

  it("omits screenshots from JSON and restores the separately stored image", () => {
    const snapshot = pageSnapshot(scan);
    expect(snapshot.scan).not.toHaveProperty("screenshot");
    expect(restorePageSnapshot(snapshot, scan.id, "image-data")).toEqual(scan);
  });

  it("rejects unsupported snapshots, mismatched scan IDs and incomplete results", () => {
    expect(() => restorePageSnapshot({ ...pageSnapshot(scan), version: 2 }, scan.id, null)).toThrow();
    expect(() => restorePageSnapshot(pageSnapshot(scan), "another-scan", null)).toThrow();
    expect(() => pageSnapshot({ ...scan, status: "failed" })).toThrow();
  });
});