import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), key: vi.fn(), session: vi.fn(), user: vi.fn(), member: vi.fn(), touch: vi.fn(), rate: vi.fn(), token: vi.fn(), feedback: vi.fn(), count: vi.fn(), aggregate: vi.fn(), proposals: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("next-auth/jwt", () => ({ getToken: mocks.token }));
vi.mock("@/lib/auth/config", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/api-guard", () => ({ requireWorkspacePermission: mocks.permission }));
vi.mock("@/lib/auth/api-key", () => ({ authenticateApiKey: mocks.key }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rate, rateLimitSync: () => ({ success: true }), RATE_LIMITS: { api: { limit: 120, windowSec: 60 } }, rateLimitHeaders: () => ({}) }));
vi.mock("@/lib/database/prisma", () => ({ prisma: {
  user: { findUnique: mocks.user }, workspaceMember: { findFirst: mocks.member, findUnique: mocks.member }, apiKey: { update: mocks.touch },
  feedbackEntry: { findMany: mocks.feedback, count: mocks.count, aggregate: mocks.aggregate }, promptImprovement: { count: mocks.proposals },
} }));
vi.mock("@/lib/ai/profile/service", () => ({ inferPreferences: vi.fn() }));

import { gatewayAuth } from "@/lib/api/gateway";
import { proxy } from "@/proxy";
import { GET as feedbackOverview } from "@/app/api/v1/evaluate/route";

const request = (endpoint = "search", method = "POST", headers: Record<string, string> = {}) => new NextRequest(`http://localhost:3000/api/v1/${endpoint}`, { method, headers });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { email: "member@example.test" } });
  mocks.permission.mockResolvedValue({ ok: true, ctx: { userId: "member", email: "member@example.test", workspaceId: "selected-workspace", workspaceRole: "VIEWER" } });
  mocks.user.mockResolvedValue({ id: "member" });
  mocks.member.mockResolvedValue({ workspaceId: "first-workspace", role: "VIEWER" });
  mocks.rate.mockResolvedValue({ success: true });
  mocks.touch.mockResolvedValue({});
  mocks.token.mockResolvedValue(null);
  mocks.feedback.mockResolvedValue([]); mocks.count.mockResolvedValue(0); mocks.aggregate.mockResolvedValue({ _avg: { rating: null } }); mocks.proposals.mockResolvedValue(0);
});

describe("v1 release acceptance boundary", () => {
  it("uses selected authorized session context", async () => {
    expect(await gatewayAuth(request(), "search")).toMatchObject({ ok: true, ctx: { workspaceId: "selected-workspace" } });
    expect(mocks.permission).toHaveBeenCalledWith("scans.view");
  });
  it("rejects a session guard result without workspace scope", async () => {
    mocks.permission.mockResolvedValue({ ok: true, ctx: { userId: "member", email: "member@example.test", workspaceId: null } });
    const result = await gatewayAuth(request(), "search");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(mocks.rate).not.toHaveBeenCalled();
  });
  it("preserves rate-limit refusal for authorized callers", async () => {
    mocks.rate.mockResolvedValue({ success: false });
    const result = await gatewayAuth(request(), "search");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(429);
  });
  it.each(["agents", "workflow", "embed"])("requires execution permission for POST %s", async (endpoint) => {
    mocks.permission.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    const result = await gatewayAuth(request(endpoint), endpoint);
    expect(result.ok).toBe(false);
    expect(mocks.permission).toHaveBeenCalledWith("scans.run");
  });
  it("keeps agent catalog available with read permission", async () => {
    expect((await gatewayAuth(request("agents", "GET"), "agents")).ok).toBe(true);
    expect(mocks.permission).toHaveBeenCalledWith("scans.view");
  });
  it.each<Record<string, string>>([{ authorization: "Bearer wrong-token" }, { authorization: "Basic invalid" }, { "x-api-key": "unsupported" }])("does not fall back to a session with explicit invalid credentials %j", async (headers) => {
    const result = await gatewayAuth(request("search", "POST", headers), "search");
    expect(result.ok).toBe(false);
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("rejects a key whose creator is no longer a workspace member", async () => {
    mocks.key.mockResolvedValue({ id: "key", workspaceId: "key-workspace", userId: "former-member" });
    mocks.member.mockResolvedValue(null);
    expect((await gatewayAuth(request("search", "POST", { authorization: "Bearer rl_synthetic" }), "search")).ok).toBe(false);
    expect(mocks.touch).not.toHaveBeenCalled();
  });
  it("does not let a viewer-owned key execute a workflow", async () => {
    mocks.key.mockResolvedValue({ id: "key", workspaceId: "key-workspace", userId: "member" });
    expect((await gatewayAuth(request("workflow", "POST", { authorization: "Bearer rl_synthetic" }), "workflow")).ok).toBe(false);
    expect(mocks.touch).not.toHaveBeenCalled();
  });
  it("allows a scoped read key and never replaces its workspace with session context", async () => {
    mocks.key.mockResolvedValue({ id: "key", workspaceId: "key-workspace", userId: "member" });
    expect(await gatewayAuth(request("search", "POST", { authorization: "Bearer rl_synthetic" }), "search")).toMatchObject({ ok: true, ctx: { workspaceId: "key-workspace", authMethod: "api-key" } });
  });
  it("lets reviewed v1 routes reach their own key authentication without session cookies", async () => {
    const response = await proxy(request("search", "POST", { authorization: "Bearer rl_synthetic" }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
  it("retains cross-origin refusal for session mutations", async () => {
    const response = await proxy(request("workflow", "POST", { cookie: "session=synthetic", origin: "https://foreign.example" }));
    expect(response.status).toBe(403);
  });
  it("does not exempt unknown v1 routes from proxy authentication", async () => {
    expect((await proxy(request("unknown"))).status).toBe(401);
  });
  it("scopes feedback comments and aggregates to the caller workspace", async () => {
    await feedbackOverview(new NextRequest("http://localhost:3000/api/v1/evaluate?promptId=chat-system"));
    expect(mocks.feedback).toHaveBeenCalledWith(expect.objectContaining({ where: { promptId: "chat-system", workspaceId: "selected-workspace" } }));
    await feedbackOverview(request("evaluate", "GET"));
    expect(mocks.count).toHaveBeenCalledWith({ where: { workspaceId: "selected-workspace" } });
    expect(mocks.aggregate).toHaveBeenCalledWith({ where: { workspaceId: "selected-workspace" }, _avg: { rating: true } });
    expect(mocks.proposals).not.toHaveBeenCalled();
  });
});