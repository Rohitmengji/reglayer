/**
 * SB-04 — the executive report must scope to the SELECTED workspace for every
 * user, matching the collaborative dashboard/history behaviour, rather than
 * filtering an ordinary user by their own id (which would pull their scans from
 * other workspaces and omit colleagues' scans in the shared workspace).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  scanFindMany: vi.fn(),
  scanAgg: vi.fn(),
  scanGroup: vi.fn(),
  violationGroup: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/features/require-feature", () => ({ requireFeature: mocks.guard }));
vi.mock("@/lib/database/prisma", () => ({
  prisma: {
    scan: { findMany: mocks.scanFindMany, aggregate: mocks.scanAgg, groupBy: mocks.scanGroup },
    violation: { groupBy: mocks.violationGroup },
  },
}));

import { GET } from "@/app/api/executive/route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.guard.mockResolvedValue({ allowed: true, userId: "user-1", workspaceId: "workspace-a", isMasterAdmin: false });
  mocks.scanFindMany.mockResolvedValue([]);
  mocks.scanAgg.mockResolvedValue({ _avg: { score: null }, _sum: { totalViolations: null }, _count: 0 });
  mocks.scanGroup.mockResolvedValue([]);
  mocks.violationGroup.mockResolvedValue([]);
});

describe("executive report scope", () => {
  it("scopes an ordinary user to the selected workspace, never their user id", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    for (const call of mocks.scanFindMany.mock.calls) {
      expect(call[0].where).toMatchObject({ workspaceId: "workspace-a" });
      expect(call[0].where).not.toHaveProperty("userId");
    }
    expect(mocks.scanAgg.mock.calls[0][0].where).toMatchObject({ workspaceId: "workspace-a" });
    expect(mocks.scanAgg.mock.calls[0][0].where).not.toHaveProperty("userId");
    expect(mocks.scanGroup.mock.calls[0][0].where).toMatchObject({ workspaceId: "workspace-a" });
    // Violation aggregates filter through the scan relation.
    expect(mocks.violationGroup.mock.calls[0][0].where).toEqual({ scan: { workspaceId: "workspace-a" } });
  });

  it("falls back to creator-owned, workspace-less scans only when no workspace resolves", async () => {
    mocks.guard.mockResolvedValue({ allowed: true, userId: "user-1", workspaceId: "", isMasterAdmin: true });

    await GET();

    expect(mocks.scanFindMany.mock.calls[0][0].where).toMatchObject({ userId: "user-1", workspaceId: null });
    expect(mocks.violationGroup.mock.calls[0][0].where).toEqual({ scan: { userId: "user-1", workspaceId: null } });
  });

  it("propagates a guard denial", async () => {
    mocks.guard.mockResolvedValue({ allowed: false, response: new Response(null, { status: 403 }) });

    expect((await GET()).status).toBe(403);
    expect(mocks.scanFindMany).not.toHaveBeenCalled();
  });
});
