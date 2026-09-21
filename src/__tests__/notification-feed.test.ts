import { beforeEach, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), prefs: vi.fn(), scans: vi.fn(), logs: vi.fn() }));
vi.mock("@/lib/auth/api-guard", () => ({ requireWorkspacePermission: mocks.guard }));
vi.mock("@/lib/database/prisma", () => ({ prisma: {
  notificationPreference: { findUnique: mocks.prefs }, scan: { findMany: mocks.scans }, auditLog: { findMany: mocks.logs },
} }));
import { GET } from "@/app/api/notifications/feed/route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "user-1", workspaceId: "selected-workspace" } });
  mocks.prefs.mockResolvedValue(null);
  mocks.scans.mockResolvedValue([]);
  mocks.logs.mockResolvedValue([]);
});
it("scopes all reads to the selected workspace and returns a private read-state scope", async () => {
  const response = await GET();
  expect(mocks.scans).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: "selected-workspace", status: "COMPLETED" } }));
  expect(mocks.logs).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: "selected-workspace" } }));
  expect(await response.json()).toEqual({ scope: JSON.stringify(["user-1", "selected-workspace"]), items: [] });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("fails closed on invalid workspace selection without reading notifications", async () => {
  mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Unavailable workspace" }, { status: 403 }) });
  expect((await GET()).status).toBe(403);
  expect(mocks.scans).not.toHaveBeenCalled();
  expect(mocks.logs).not.toHaveBeenCalled();
});
it("does not return disabled preference categories", async () => {
  mocks.prefs.mockResolvedValue({ scanComplete: false, newViolations: false, teamActivity: false });
  expect((await (await GET()).json()).items).toEqual([]);
  expect(mocks.scans).not.toHaveBeenCalled();
  expect(mocks.logs).not.toHaveBeenCalled();
});
it("does not read other workspaces for a legacy unscoped user", async () => {
  mocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "user-1", workspaceId: null } });
  await GET();
  expect(mocks.scans).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-1", workspaceId: null, status: "COMPLETED" } }));
  expect(mocks.logs).not.toHaveBeenCalled();
});