/**
 * Tests for the Knowledge Connectors service — focused on the SSRF guard in
 * the URL connector (the security-critical path) and connector result shape.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const validateScanUrl = vi.fn();
const resolvesToInternalIp = vi.fn();
vi.mock("@/lib/validations/ssrf", () => ({
  validateScanUrl: (...a: unknown[]) => validateScanUrl(...a),
  resolvesToInternalIp: (...a: unknown[]) => resolvesToInternalIp(...a),
}));

const createDocument = vi.fn();
const processDocument = vi.fn();
vi.mock("@/lib/ai/knowledge/service", () => ({
  createDocument: (...a: unknown[]) => createDocument(...a),
  processDocument: (...a: unknown[]) => processDocument(...a),
}));

import { syncURL } from "@/lib/ai/knowledge/connectors";

const OPTS = { workspaceId: "ws_1", userId: "u_1" };

describe("syncURL — SSRF protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    createDocument.mockResolvedValue({ id: "doc_1" });
    processDocument.mockResolvedValue(undefined);
  });

  it("rejects URLs that fail the literal SSRF check without fetching", async () => {
    validateScanUrl.mockReturnValue("Scanning internal addresses is not allowed");

    const result = await syncURL({ urls: ["http://169.254.169.254/latest/meta-data"], ...OPTS });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.documentsProcessed).toBe(0);
    expect(result.errors[0]).toContain("Scanning internal addresses is not allowed");
  });

  it("rejects public hostnames that resolve to internal IPs (fail-closed)", async () => {
    validateScanUrl.mockReturnValue(null); // passes literal check
    resolvesToInternalIp.mockResolvedValue(true); // but resolves internally

    const result = await syncURL({ urls: ["http://rebind.evil.test"], ...OPTS });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.errors[0]).toContain("internal address");
  });

  it("fetches and processes a safe URL", async () => {
    validateScanUrl.mockReturnValue(null);
    resolvesToInternalIp.mockResolvedValue(false);
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: async () => "<html><body>" + "Accessible content ".repeat(20) + "</body></html>",
    });

    const result = await syncURL({ urls: ["https://example.com/docs"], ...OPTS });

    expect(fetch).toHaveBeenCalledOnce();
    expect(createDocument).toHaveBeenCalledOnce();
    expect(processDocument).toHaveBeenCalledOnce();
    expect(result.documentsProcessed).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it("records an error for non-OK HTTP responses", async () => {
    validateScanUrl.mockReturnValue(null);
    resolvesToInternalIp.mockResolvedValue(false);
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 404 });

    const result = await syncURL({ urls: ["https://example.com/missing"], ...OPTS });

    expect(result.documentsProcessed).toBe(0);
    expect(result.errors[0]).toContain("HTTP 404");
  });

  it("caps processing at 10 URLs per sync", async () => {
    validateScanUrl.mockReturnValue(null);
    resolvesToInternalIp.mockResolvedValue(false);
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: async () => "content ".repeat(50),
    });

    const urls = Array.from({ length: 25 }, (_, i) => `https://example.com/p${i}`);
    await syncURL({ urls, ...OPTS });

    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThanOrEqual(10);
  });
});
