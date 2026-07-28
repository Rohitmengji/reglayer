/**
 * Tests for the RegLayer TypeScript SDK client.
 *
 * Verifies URL construction, auth headers, error handling, and resource routing
 * with a mocked global fetch — no network calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RegLayer, RegLayerError } from "@/lib/sdk";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, statusText: "OK", json: async () => body };
}

describe("RegLayer SDK client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("normalizes a trailing slash on baseUrl", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "s_1" }));
    const client = new RegLayer({ apiKey: "rl_test", baseUrl: "https://api.example.com/" });
    await client.scans.get("s_1");
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toBe("https://api.example.com/api/v1/scans/s_1");
  });

  it("sends the Bearer auth header and SDK user-agent", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "s_1" }));
    const client = new RegLayer({ apiKey: "rl_secret" });
    await client.scans.get("s_1");
    const opts = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
    expect(opts.headers.Authorization).toBe("Bearer rl_secret");
    expect(opts.headers["User-Agent"]).toContain("reglayer-sdk");
  });

  it("creates a scan via POST with a JSON body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "s_2", url: "https://x.com" }));
    const client = new RegLayer({ apiKey: "rl_test" });
    const scan = await client.scans.create({ url: "https://x.com" });
    const [url, opts] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toContain("/api/v1/scans");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ url: "https://x.com" });
    expect(scan.id).toBe("s_2");
  });

  it("throws a typed RegLayerError with status on failure", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "Not found" }, false, 404));
    const client = new RegLayer({ apiKey: "rl_test" });
    await expect(client.scans.get("missing")).rejects.toMatchObject({
      name: "RegLayerError",
      status: 404,
      message: "Not found",
    });
  });

  it("falls back to statusText when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
      json: async () => { throw new Error("not json"); },
    });
    const client = new RegLayer({ apiKey: "rl_test" });
    await expect(client.violations.get("v_1")).rejects.toBeInstanceOf(RegLayerError);
  });

  it("builds violation list query params", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [], total: 0, page: 1, limit: 20, hasMore: false }));
    const client = new RegLayer({ apiKey: "rl_test" });
    await client.violations.list({ scanId: "s_1", impact: "critical", limit: 10 });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("scanId=s_1");
    expect(url).toContain("impact=critical");
    expect(url).toContain("limit=10");
  });

  it("routes agent runs to POST /agents/run", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ runId: "r_1", status: "completed", result: "ok", durationMs: 5 }));
    const client = new RegLayer({ apiKey: "rl_test" });
    const res = await client.agents.run({ agentSlug: "auditor", task: "scan" });
    const [url, opts] = fetchMock.mock.calls[0] as [string, { method: string }];
    expect(url).toContain("/api/v1/agents/run");
    expect(opts.method).toBe("POST");
    expect(res.runId).toBe("r_1");
  });
});
