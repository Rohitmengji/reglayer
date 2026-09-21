import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), user: vi.fn(), entries: vi.fn(), count: vi.fn() }));
vi.mock("@/lib/auth/api-guard", () => ({ requireWorkspacePermission: mocks.guard }));
vi.mock("@/lib/database/prisma", () => ({ prisma: { user: { findUnique: mocks.user }, auditLog: { findMany: mocks.entries, count: mocks.count } } }));

import { GET } from "@/app/api/audit-log/route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "viewer", workspaceId: "selected-workspace", isMasterAdmin: false } });
  mocks.user.mockResolvedValue({ plan: "PRO" });
  const target = new URL("https://example.test/private?token=secret#secret");
  target.username = "user";
  target.password = "secret";
  mocks.entries.mockResolvedValue([{
    id: "event-one", action: "scan.failed", actor: "member@example.test",
    target: target.href, createdAt: new Date("2026-09-21T00:00:00Z"),
    metadata: { error: "Prisma failed", stack: "private stack", password: "secret" },
  }]);
  mocks.count.mockResolvedValue(1);
});

describe("customer activity feed", () => {
  it.each([false, true])("scopes rows and counts to the selected workspace (master=%s)", async isMasterAdmin => {
    mocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "member", workspaceId: "selected-workspace", isMasterAdmin } });
    const response = await GET(new NextRequest("http://localhost/api/audit-log?page=2&limit=10"));
    expect(response.status).toBe(200);
    expect(mocks.guard).toHaveBeenCalledWith("scans.view");
    expect(mocks.entries).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: "selected-workspace", createdAt: { gte: expect.any(Date) } }, skip: 10, take: 10 }));
    expect(mocks.count).toHaveBeenCalledWith({ where: mocks.entries.mock.calls[0][0].where });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("returns an actionable summary without raw diagnostics or URL credentials", async () => {
    const body = await (await GET(new NextRequest("http://localhost/api/audit-log"))).json();
    expect(body.logs[0]).toMatchObject({ action: "scan.failed", target: "https://example.test", summary: "The scan did not complete. Review scan history before trying again." });
    expect(body.logs[0]).not.toHaveProperty("metadata");
    expect(JSON.stringify(body)).not.toMatch(/secret|Prisma|private stack/);
    expect(mocks.entries.mock.calls[0][0].select).not.toHaveProperty("metadata");
  });

  it.each(["page=0", "page=-1", "page=NaN", "page=1.5", "limit=0", "limit=101"])("rejects invalid pagination: %s", async query => {
    expect((await GET(new NextRequest(`http://localhost/api/audit-log?${query}`))).status).toBe(400);
    expect(mocks.entries).not.toHaveBeenCalled();
  });

  it("does not query history after authorization or selected-workspace failure", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Unavailable workspace" }, { status: 403 }) });
    expect((await GET(new NextRequest("http://localhost/api/audit-log"))).status).toBe(403);
    mocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "member", workspaceId: null, isMasterAdmin: true } });
    expect((await GET(new NextRequest("http://localhost/api/audit-log"))).status).toBe(403);
    expect(mocks.entries).not.toHaveBeenCalled();
  });

  it("returns a safe retryable failure instead of leaking database errors", async () => {
    const databaseUrl = new URL("postgresql://database");
    databaseUrl.username = "private";
    databaseUrl.password = "secret";
    mocks.entries.mockRejectedValue(new Error(databaseUrl.href));
    const response = await GET(new NextRequest("http://localhost/api/audit-log"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Activity is temporarily unavailable. Please try again." });
  });
});