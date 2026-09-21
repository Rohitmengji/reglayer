import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ session: vi.fn(), permission: vi.fn(), member: vi.fn(), workspace: vi.fn(), site: vi.fn(), create: vi.fn(), list: vi.fn(), execute: vi.fn(), rate: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth/config", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/api-guard", () => ({ requireWorkspacePermission: mocks.permission }));
vi.mock("@/lib/database/prisma", () => ({ prisma: {
  workspaceMember: { findFirst: mocks.member }, workspace: { findUnique: mocks.workspace }, site: { findFirst: mocks.site },
  agentRun: { create: mocks.create, findMany: mocks.list, update: vi.fn() },
} }));
vi.mock("@/lib/agents/runner", () => ({ executeAgentRun: mocks.execute }));
vi.mock("@/lib/validations/ssrf", () => ({ validateScanUrl: () => null }));
vi.mock("@/lib/rate-limit-middleware", () => ({ applyRateLimit: mocks.rate }));
import { GET, POST } from "@/app/api/agents/run/route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { email: "audit@example.test" } });
  mocks.permission.mockResolvedValue({ ok: true, ctx: { userId: "member", workspaceId: "selected-workspace", isMasterAdmin: false } });
  mocks.member.mockResolvedValue({ workspace: { id: "first-workspace", plan: "PRO" }, role: "VIEWER" });
  mocks.workspace.mockResolvedValue({ plan: "PRO" });
  mocks.site.mockResolvedValue({ id: "site-a" });
  mocks.create.mockResolvedValue({ id: "run-a" });
  mocks.list.mockResolvedValue([]);
  mocks.execute.mockResolvedValue(undefined);
  mocks.rate.mockResolvedValue(null);
});
const request = () => new NextRequest("http://localhost/api/agents/run", { method: "POST", body: JSON.stringify({ siteId: "site-a", persona: "KEYBOARD", goal: "Complete the checkout", startUrl: "https://example.test" }) });

describe("Adversarial agent launch authorization", () => {
  it("denies a viewer before any run or browser is created", async () => {
    mocks.permission.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.permission).toHaveBeenCalledWith("scans.run");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("uses the authorized workspace for site, run and execution", async () => {
    expect((await POST(request())).status).toBe(202);
    expect(mocks.site).toHaveBeenCalledWith({ where: { id: "site-a", workspaceId: "selected-workspace" } });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ workspaceId: "selected-workspace" }) }));
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "selected-workspace" }));
  });
  it("rejects a site outside the authorized workspace", async () => {
    mocks.site.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("scopes history to selected read permission", async () => {
    expect((await GET(new NextRequest("http://localhost/api/agents/run"))).status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith("scans.view");
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: "selected-workspace" } }));
  });
  it("rate limits launches before execution", async () => {
    mocks.rate.mockResolvedValue(NextResponse.json({ error: "Too many requests" }, { status: 429 }));
    expect((await POST(request())).status).toBe(429);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});