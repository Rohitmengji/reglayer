import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ session: vi.fn(), cookie: vi.fn(), user: vi.fn(), createUser: vi.fn(), updateUser: vi.fn(), findMember: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), hash: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie }) }));
vi.mock("@/lib/auth/config", () => ({ authOptions: {} }));
vi.mock("@/lib/database/prisma", () => ({ prisma: {
  user: { findUnique: mocks.user, create: mocks.createUser, update: mocks.updateUser },
  workspaceMember: { findUnique: mocks.findMember, findFirst: mocks.findFirst, count: mocks.count, create: mocks.create, update: mocks.update, delete: mocks.remove },
} }));
vi.mock("@/lib/email/service", () => ({ isEmailConfigured: () => false, sendTeamInviteEmail: vi.fn() }));
vi.mock("@/lib/rate-limit-middleware", () => ({ applyRateLimit: async () => null }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ success: true }) }));
vi.mock("@/lib/telemetry/logger", () => ({ logger: { withContext: () => ({ error: vi.fn() }) } }));
vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));

import { GET, POST, PATCH, DELETE, PUT } from "@/app/api/team/route";

const memberships = [
  { id: "owner-membership", workspaceId: "workspace-a", role: "OWNER", workspace: { id: "workspace-a", name: "Alpha", slug: "alpha", plan: "ENTERPRISE", members: [] } },
  { id: "viewer-membership", workspaceId: "workspace-b", role: "VIEWER", workspace: { id: "workspace-b", name: "Beta", slug: "beta", plan: "PRO", members: [] } },
];
const actor = () => ({ id: "actor", email: "actor@example.test", name: "Actor", plan: "ENTERPRISE", isMasterAdmin: false, memberships: structuredClone(memberships) });
const request = (method: string, body?: unknown, query = "") => new NextRequest(`http://localhost/api/team${query}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { email: "actor@example.test" } });
  mocks.cookie.mockReturnValue({ value: "workspace-b" });
  mocks.user.mockImplementation(async (query) => query.where.email === "actor@example.test" ? actor() : { id: "invitee", email: query.where.email });
  mocks.count.mockResolvedValue(1);
  mocks.findMember.mockImplementation(async (query) => query.where.id ? { id: query.where.id, userId: "target", role: "MEMBER", workspaceId: "workspace-a" } : null);
  mocks.findFirst.mockResolvedValue({ id: "target", userId: "target", role: "MEMBER", workspaceId: "workspace-b" });
  mocks.create.mockResolvedValue({ id: "new", role: "MEMBER", user: { id: "invitee", email: "invitee@example.test", name: "Invitee" }, joinedAt: new Date() });
  mocks.update.mockResolvedValue({ id: "target", role: "VIEWER" });
  mocks.hash.mockResolvedValue("synthetic-hash");
});

describe("Team selected-workspace acceptance", () => {
  it("returns selected membership and role rather than the first workspace", async () => {
    const response = await GET();
    expect(await response.json()).toMatchObject({ workspace: { id: "workspace-b" }, currentUserRole: "VIEWER" });
  });

  it.each(["POST", "PATCH", "DELETE"])("denies %s for a selected viewer even when they own another workspace", async (method) => {
    const response = method === "POST"
      ? await POST(request(method, { email: "invitee@example.test", role: "MEMBER" }))
      : method === "PATCH" ? await PATCH(request(method, { memberId: "target", role: "VIEWER" }))
      : await DELETE(request(method, undefined, "?id=target"));
    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("rejects stale selection without returning another team's data", async () => {
    mocks.cookie.mockReturnValue({ value: "removed-workspace" });
    expect((await GET()).status).toBe(403);
    expect((await POST(request("POST", { email: "invitee@example.test" }))).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("retains earliest-membership default only when no selection exists", async () => {
    mocks.cookie.mockReturnValue(undefined);
    expect(await (await GET()).json()).toMatchObject({ workspace: { id: "workspace-a" } });
  });

  it("uses the selected workspace plan and destination when inviting", async () => {
    const admin = actor();
    admin.memberships[1].role = "ADMIN";
    mocks.user.mockImplementation(async (query) => query.where.email === "actor@example.test" ? admin : { id: "invitee", email: query.where.email });
    expect((await POST(request("POST", { email: "invitee@example.test", role: "MEMBER" }))).status).toBe(201);
    expect(mocks.count).toHaveBeenCalledWith({ where: { workspaceId: "workspace-b" } });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: { userId: "invitee", workspaceId: "workspace-b", role: "MEMBER" } }));
  });

  it("does not mutate a first-workspace member from the selected workspace", async () => {
    const admin = actor(); admin.memberships[1].role = "ADMIN";
    mocks.user.mockResolvedValue(admin);
    expect((await PATCH(request("PATCH", { memberId: "foreign", role: "VIEWER" }))).status).toBe(404);
    expect((await DELETE(request("DELETE", undefined, "?id=foreign"))).status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("does not let a workspace owner set a global account password", async () => {
    mocks.cookie.mockReturnValue({ value: "workspace-a" });
    expect((await PUT(request("PUT", { userId: "target", newPassword: "synthetic-password" }))).status).toBe(403);
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("revokes existing sessions when a system admin resets an authorized member password", async () => {
    const admin = actor(); admin.isMasterAdmin = true; admin.memberships[1].role = "OWNER";
    mocks.user.mockResolvedValue(admin);
    expect((await PUT(request("PUT", { userId: "target", newPassword: "synthetic-password" }))).status).toBe(200);
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { userId: "target", workspaceId: "workspace-b" } });
    expect(mocks.hash).toHaveBeenCalledWith("synthetic-password", 12);
    expect(mocks.updateUser).toHaveBeenCalledWith({ where: { id: "target" }, data: { passwordHash: "synthetic-hash", sessionsRevokedAt: expect.any(Date) } });
  });

  it.each(["stale", "foreign", "viewer"])("rejects a system-admin password reset with %s workspace access", async (scenario) => {
    const admin = actor(); admin.isMasterAdmin = true;
    if (scenario !== "viewer") admin.memberships[1].role = "OWNER";
    mocks.user.mockResolvedValue(admin);
    if (scenario === "stale") mocks.cookie.mockReturnValue({ value: "removed-workspace" });
    if (scenario === "foreign") mocks.findFirst.mockResolvedValue(null);
    expect((await PUT(request("PUT", { userId: "target", newPassword: "synthetic-password" }))).status).toBe(scenario === "foreign" ? 404 : 403);
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it.each(["too-short", "a".repeat(73), "\u00e9".repeat(37)])("rejects an out-of-bounds password before hashing: %s", async (newPassword) => {
    expect((await PUT(request("PUT", { userId: "target", newPassword }))).status).toBe(400);
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});