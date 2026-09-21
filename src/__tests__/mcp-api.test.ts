import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ session: vi.fn(), permission: vi.fn(), scans: vi.fn(), violations: vi.fn(), scan: vi.fn(), search: vi.fn(), rate: vi.fn(), log: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth/config", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/api-guard", () => ({ requireWorkspacePermission: mocks.permission }));
vi.mock("@/lib/database/prisma", () => ({ prisma: { scan: { findMany: mocks.scans, findFirst: mocks.scan }, violation: { findMany: mocks.violations } } }));
vi.mock("@/lib/ai/vector/search", () => ({ searchViolations: mocks.search }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rate, RATE_LIMITS: { api: {} }, rateLimitHeaders: () => ({}) }));
vi.mock("@/lib/telemetry/logger", () => ({ logger: { error: mocks.log } }));

import { POST } from "@/app/api/mcp/route";

const request = (body: unknown, raw = false) => new NextRequest("http://localhost/api/mcp", { method: "POST", body: raw ? String(body) : JSON.stringify(body) });
const rpc = (method: string, params?: Record<string, unknown>) => ({ jsonrpc: "2.0", id: 7, method, params });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { email: "member@example.test" } });
  mocks.permission.mockResolvedValue({ ok: true, ctx: { userId: "member", workspaceId: "workspace-a", workspaceRole: "VIEWER" } });
  mocks.rate.mockResolvedValue({ success: true });
  mocks.scans.mockResolvedValue([]);
  mocks.scan.mockResolvedValue({ id: "own-scan" });
  mocks.violations.mockResolvedValue([]);
  mocks.search.mockResolvedValue([]);
});

describe("MCP tenant and protocol boundary", () => {
  it("rejects unauthenticated callers", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await POST(request(rpc("resources/list")))).status).toBe(401);
    expect(mocks.scans).not.toHaveBeenCalled();
  });

  it("applies workspace read permission before any data access", async () => {
    mocks.permission.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await POST(request(rpc("resources/read", { uri: "reglayer://scans" })))).status).toBe(403);
    expect(mocks.scans).not.toHaveBeenCalled();
  });

  it.each(["reglayer://scans", "reglayer://compliance"])("scopes %s to the selected workspace", async (uri) => {
    const response = await POST(request(rpc("resources/read", { uri })));
    expect(response.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith("scans.view");
    expect(mocks.scans).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ workspaceId: "workspace-a" }) }));
  });

  it("refuses a foreign scan before retrieving violations", async () => {
    mocks.scan.mockResolvedValue(null);
    const response = await POST(request(rpc("tools/call", { name: "get_scan_details", arguments: { scanId: "foreign-scan" } })));
    expect((await response.json()).error).toMatchObject({ code: -32602 });
    expect(mocks.scan).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "foreign-scan", workspaceId: "workspace-a" } }));
    expect(mocks.violations).not.toHaveBeenCalled();
  });

  it("scopes violations even after checking scan ownership", async () => {
    await POST(request(rpc("resources/read", { uri: "reglayer://scans/own-scan" })));
    expect(mocks.violations).toHaveBeenCalledWith(expect.objectContaining({ where: { scanId: "own-scan", scan: { workspaceId: "workspace-a" } } }));
  });

  it("scopes vector search and ignores caller-supplied workspace overrides", async () => {
    await POST(request(rpc("tools/call", { name: "search_violations", arguments: { query: "contrast", limit: 5, workspaceId: "workspace-b" } })));
    expect(mocks.search).toHaveBeenCalledWith("contrast", { limit: 5, workspaceId: "workspace-a" });
  });

  it.each([null, [], { jsonrpc: "2.0", id: {}, method: "tools/list" }, { jsonrpc: "2.0", id: 1, method: 42 }, { jsonrpc: "2.0", id: 1, method: "tools/call", params: [] }])("returns invalid-request for malformed envelopes: %j", async (body) => {
    const response = await POST(request(body));
    expect((await response.json()).error.code).toBe(-32600);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("returns parse error with a null id", async () => {
    expect(await (await POST(request("{bad", true))).json()).toMatchObject({ id: null, error: { code: -32700 } });
  });

  it.each([{ query: "contrast", limit: 100000 }, { query: "", limit: 5 }, { query: 3 }, { query: "contrast", limit: -1 }])("rejects invalid tool arguments: %j", async (args) => {
    const response = await POST(request(rpc("tools/call", { name: "search_violations", arguments: args })));
    expect((await response.json()).error.code).toBe(-32602);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("does not disguise vector failure as empty search success", async () => {
    mocks.search.mockRejectedValue(new Error("private database failure"));
    const body = await (await POST(request(rpc("tools/call", { name: "search_violations", arguments: { query: "contrast" } })))).json();
    expect(body.error.code).toBe(-32603);
    expect(JSON.stringify(body)).not.toContain("private database");
  });

  it("redacts internal errors from resources", async () => {
    mocks.scans.mockRejectedValue(new Error("private connection details"));
    const body = await (await POST(request(rpc("resources/read", { uri: "reglayer://scans" })))).json();
    expect(body.error).toEqual({ code: -32603, message: "Request could not be completed. Please try again." });
  });

  it("acknowledges initialization notification without a JSON-RPC response", async () => {
    expect((await POST(request({ jsonrpc: "2.0", method: "notifications/initialized" }))).status).toBe(204);
  });
});