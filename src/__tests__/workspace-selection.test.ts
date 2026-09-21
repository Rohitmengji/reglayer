import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), user: vi.fn(), member: vi.fn(), firstMember: vi.fn(), cookie: vi.fn(),
  feature: vi.fn(), createWorkspace: vi.fn(),
  features: vi.fn(), scans: vi.fn(), aggregate: vi.fn(), scanGroups: vi.fn(), violationGroups: vi.fn(),
  authConfig: vi.fn(), deleteAuthConfig: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie }) }));
vi.mock("@/lib/auth/config", () => ({ authOptions: {} }));
vi.mock("@/lib/database/prisma", () => ({ prisma: {
  user: { findUnique: mocks.user },
  workspaceMember: { findUnique: mocks.member, findFirst: mocks.firstMember },
  workspace: { create: mocks.createWorkspace },
  scan: { findMany: mocks.scans, aggregate: mocks.aggregate, groupBy: mocks.scanGroups },
  violation: { groupBy: mocks.violationGroups },
  authConfig: { findFirst: mocks.authConfig, delete: mocks.deleteAuthConfig },
} }));
vi.mock("@/lib/features/feature-access", () => ({ hasFeature: mocks.feature, getWorkspaceFeatures: mocks.features, getWorkspaceFeaturesDetailed: vi.fn() }));

import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { getOrCreateWorkspace } from "@/lib/database/workspace";
import { requireFeature } from "@/lib/features/require-feature";
import { GET, POST } from "@/app/api/workspaces/route";
import { GET as listScans } from "@/app/api/scans/route";
import { GET as dashboardStats } from "@/app/api/dashboard/stats/route";
import { GET as workspaceFeatures } from "@/app/api/workspace/features/route";
import { getPlanContext } from "@/lib/credits/plan-context";
import { DELETE as deleteCredentials } from "@/app/api/auth-configs/[id]/route";

const memberships = [
  { workspaceId: "owner-workspace", role: "OWNER", workspace: { id: "owner-workspace", name: "Owner workspace", slug: "owner", plan: "ENTERPRISE", _count: { members: 1, scans: 2 } } },
  { workspaceId: "viewer-workspace", role: "VIEWER", workspace: { id: "viewer-workspace", name: "Viewer workspace", slug: "viewer", plan: "FREE", _count: { members: 2, scans: 1 } } },
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { email: "member@example.test" } });
  mocks.user.mockResolvedValue({ id: "member", email: "member@example.test", plan: "FREE", isMasterAdmin: false, memberships });
  mocks.feature.mockResolvedValue({ enabled: true });
  mocks.features.mockResolvedValue(["scans"]);
  mocks.scans.mockResolvedValue([]);
  mocks.aggregate.mockResolvedValue({ _count: 0, _avg: { score: null }, _sum: { totalViolations: 0 } });
  mocks.scanGroups.mockResolvedValue([]);
  mocks.violationGroups.mockResolvedValue([]);
  mocks.firstMember.mockResolvedValue({ workspaceId: "owner-workspace", role: "OWNER" });
  mocks.member.mockResolvedValue({ workspaceId: "viewer-workspace", role: "VIEWER" });
});

describe("Workspace selection agreement", () => {
  it("deletes credentials only in the workspace that granted settings permission", async () => {
    mocks.cookie.mockReturnValue({ value: "selected-admin-workspace" });
    mocks.member.mockResolvedValue({ workspaceId: "selected-admin-workspace", role: "ADMIN" });
    mocks.authConfig.mockResolvedValue(null);
    const response = await deleteCredentials(new NextRequest("http://localhost/api/auth-configs/foreign", { method: "DELETE" }), { params: Promise.resolve({ id: "foreign" }) });
    expect(response.status).toBe(404);
    expect(mocks.authConfig).toHaveBeenCalledWith({ where: { id: "foreign", workspaceId: "selected-admin-workspace" }, select: { id: true } });
    expect(mocks.deleteAuthConfig).not.toHaveBeenCalled();
  });

  it("scopes every dashboard and history query to the selected workspace", async () => {
    mocks.cookie.mockReturnValue({ value: "viewer-workspace" });
    expect((await dashboardStats()).status).toBe(200);
    expect((await listScans(new NextRequest("http://localhost/api/scans"))).status).toBe(200);
    for (const [query] of mocks.scans.mock.calls) expect(query.where).toMatchObject({ workspaceId: "viewer-workspace" });
    expect(mocks.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "COMPLETED", workspaceId: "viewer-workspace" } }));
    expect(mocks.violationGroups).toHaveBeenCalledWith(expect.objectContaining({ where: { scan: { workspaceId: "viewer-workspace" } } }));
  });

  it("rejects data reads when the selected workspace membership has been removed", async () => {
    mocks.cookie.mockReturnValue({ value: "removed-workspace" });
    mocks.member.mockResolvedValue(null);
    expect((await dashboardStats()).status).toBe(403);
    expect((await listScans(new NextRequest("http://localhost/api/scans"))).status).toBe(403);
    expect(mocks.scans).not.toHaveBeenCalled();
    expect(mocks.aggregate).not.toHaveBeenCalled();
  });

  it("uses the selected workspace role for plan limits", async () => {
    mocks.cookie.mockReturnValue({ value: "viewer-workspace" });
    expect(await getPlanContext()).toMatchObject({ workspaceId: "viewer-workspace", workspaceRole: "VIEWER" });
    expect(mocks.firstMember).not.toHaveBeenCalled();
    mocks.member.mockResolvedValue(null);
    expect(await getPlanContext()).toBeNull();
  });

  it("returns selected workspace features without a cross-switch browser cache", async () => {
    mocks.cookie.mockReturnValue({ value: "viewer-workspace" });
    const response = await workspaceFeatures(new NextRequest("http://localhost/api/workspace/features"));
    expect(await response.json()).toMatchObject({ features: ["scans"], plan: "FREE", workspaceId: "viewer-workspace", permissions: ["scans.view"] });
    expect(mocks.features).toHaveBeenCalledWith("viewer-workspace");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("publishes the selected role's capabilities without inheriting another membership", async () => {
    mocks.cookie.mockReturnValue({ value: "owner-workspace" });
    const owner = await workspaceFeatures(new NextRequest("http://localhost/api/workspace/features"));
    expect((await owner.json()).permissions).toContain("scans.run");
    mocks.cookie.mockReturnValue({ value: "viewer-workspace" });
    const viewer = await workspaceFeatures(new NextRequest("http://localhost/api/workspace/features"));
    expect((await viewer.json()).permissions).toEqual(["scans.view"]);
    mocks.cookie.mockReturnValue({ value: "removed-workspace" });
    expect((await workspaceFeatures(new NextRequest("http://localhost/api/workspace/features"))).status).toBe(403);
  });

  it("uses the selected workspace for data provisioning and feature access", async () => {
    mocks.cookie.mockReturnValue({ value: "viewer-workspace" });
    expect(await getOrCreateWorkspace("member", "member@example.test")).toBe("viewer-workspace");
    expect(await requireFeature("scans")).toMatchObject({ allowed: true, workspaceId: "viewer-workspace" });
    expect(mocks.feature).toHaveBeenCalledWith("viewer-workspace", "scans");
    expect(mocks.firstMember).not.toHaveBeenCalled();
  });

  it("never provisions or gates another workspace for an invalid selection", async () => {
    mocks.cookie.mockReturnValue({ value: "removed-workspace" });
    mocks.member.mockResolvedValue(null);
    await expect(getOrCreateWorkspace("member", "member@example.test")).rejects.toThrow("Selected workspace is unavailable");
    expect(await requireFeature("scans")).toMatchObject({ allowed: false });
    expect(mocks.feature).not.toHaveBeenCalled();
    expect(mocks.createWorkspace).not.toHaveBeenCalled();
  });

  it("returns the server-selected workspace for the switcher", async () => {
    mocks.cookie.mockReturnValue({ value: "viewer-workspace" });
    const response = await GET();
    expect(await response.json()).toMatchObject({ activeWorkspaceId: "viewer-workspace", selectionInvalid: false });
  });

  it("allows recovery from stale selection without falsely naming another workspace", async () => {
    mocks.cookie.mockReturnValue({ value: "removed-workspace" });
    const response = await GET();
    expect(await response.json()).toMatchObject({ activeWorkspaceId: null, selectionInvalid: true, workspaces: [{ id: "owner-workspace" }, { id: "viewer-workspace" }] });
  });

  it("chooses the default only when no cookie is present", async () => {
    const response = await GET();
    expect(await response.json()).toMatchObject({ activeWorkspaceId: "owner-workspace", selectionInvalid: false });
  });

  it.each(["not json", "null", '{"workspaceId":123}', '{"workspaceId":" "}'])("rejects invalid switch payload %s", async (body) => {
    const response = await POST(new NextRequest("http://localhost/api/workspaces", { method: "POST", body }));
    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.firstMember).not.toHaveBeenCalled();
  });

  it("does not change the cookie when membership is denied", async () => {
    mocks.firstMember.mockResolvedValue(null);
    const response = await POST(new NextRequest("http://localhost/api/workspaces", { method: "POST", body: JSON.stringify({ workspaceId: "removed-workspace" }) }));
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("sets a protected cookie only after confirming membership", async () => {
    mocks.firstMember.mockResolvedValue(memberships[1]);
    const response = await POST(new NextRequest("http://localhost/api/workspaces", { method: "POST", body: JSON.stringify({ workspaceId: "viewer-workspace" }) }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("reglayer-workspace=viewer-workspace");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
  });
});

describe("Selected workspace permissions", () => {
  it("does not inherit owner permissions when the selected workspace role is viewer", async () => {
    mocks.cookie.mockReturnValue({ value: "viewer-workspace" });
    const result = await requireWorkspacePermission("scans.run");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(mocks.firstMember).not.toHaveBeenCalled();
  });

  it("returns the selected workspace with its own role for permitted reads", async () => {
    mocks.cookie.mockReturnValue({ value: "viewer-workspace" });
    expect(await requireWorkspacePermission("scans.view")).toMatchObject({
      ok: true, ctx: { workspaceId: "viewer-workspace", workspaceRole: "VIEWER" },
    });
  });

  it("rejects a stale selection instead of redirecting mutations to another workspace", async () => {
    mocks.cookie.mockReturnValue({ value: "removed-workspace" });
    mocks.member.mockResolvedValue(null);
    const result = await requireWorkspacePermission("scans.run");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(mocks.firstMember).not.toHaveBeenCalled();
  });

  it("uses the earliest membership only when no workspace is selected", async () => {
    expect(await requireWorkspacePermission("scans.run")).toMatchObject({
      ok: true, ctx: { workspaceId: "owner-workspace", workspaceRole: "OWNER" },
    });
  });

  it("keeps explicit resource authorization independent of the active selection", async () => {
    mocks.cookie.mockReturnValue({ value: "other-workspace" });
    await requireWorkspacePermission("scans.view", { workspaceId: "resource-workspace" });
    expect(mocks.member).toHaveBeenCalledWith({
      where: { userId_workspaceId: { userId: "member", workspaceId: "resource-workspace" } },
      select: { role: true },
    });
  });
});