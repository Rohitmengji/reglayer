import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), scan: vi.fn(), crawl: vi.fn(), session: vi.fn(),
  filtered: vi.fn(), summary: vi.fn(),
}));
vi.mock("@/lib/database/prisma", () => ({ prisma: {
  user: { findUnique: mocks.user },
  scan: { findUnique: mocks.scan },
  crawlJobRecord: { findUnique: mocks.crawl },
} }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth/config", () => ({ authOptions: {} }));
vi.mock("@/lib/features/require-feature", () => ({ requireFeature: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock("@/lib/violations/status", () => ({ getFilteredViolations: mocks.filtered, getStatusSummary: mocks.summary }));

import { assertScanAccess, assertCrawlJobAccess } from "@/lib/auth/access";
import { GET } from "@/app/api/violations/route";

const session = { user: { email: "member@example.test" }, expires: "2099-01-01" };
const member = { id: "member", isMasterAdmin: false, memberships: [{ workspaceId: "workspace" }] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue(session);
  mocks.user.mockResolvedValue(member);
  mocks.scan.mockResolvedValue({ id: "scan", workspaceId: "workspace", userId: "creator" });
  mocks.crawl.mockResolvedValue({ workspaceId: "workspace", userId: "creator" });
  mocks.filtered.mockResolvedValue({ violations: [], total: 0, page: 1, totalPages: 0 });
  mocks.summary.mockResolvedValue({});
});

describe.each([
  { name: "scan", check: assertScanAccess, record: mocks.scan },
  { name: "crawl", check: assertCrawlJobAccess, record: mocks.crawl },
])("$name resource ownership", ({ check, record }) => {
  it("rejects unauthenticated access", async () => {
    expect(await check("resource", null)).toMatchObject({ ok: false, status: 401 });
  });

  it("allows current workspace members", async () => {
    expect(await check("resource", session)).toMatchObject({ ok: true, workspaceId: "workspace" });
  });

  it("rejects the creator after workspace membership is removed", async () => {
    mocks.user.mockResolvedValue({ ...member, id: "creator", memberships: [] });
    expect(await check("resource", session)).toMatchObject({ ok: false, status: 403 });
  });

  it("preserves ownership of legacy workspace-less resources", async () => {
    record.mockResolvedValue({ workspaceId: null, userId: "member" });
    expect(await check("resource", session)).toMatchObject({ ok: true, workspaceId: null });
  });

  it("rejects other users' legacy resources", async () => {
    record.mockResolvedValue({ workspaceId: null, userId: "other-user" });
    expect(await check("resource", session)).toMatchObject({ ok: false, status: 403 });
  });

  it("preserves the explicit master-admin bypass", async () => {
    mocks.user.mockResolvedValue({ ...member, isMasterAdmin: true, memberships: [] });
    expect(await check("resource", session)).toMatchObject({ ok: true, isMasterAdmin: true });
  });
});

describe("Violation list ownership", () => {
  it("accepts bookmarked lower-case status and multi-impact filters", async () => {
    const response = await GET(new NextRequest("http://localhost/api/violations?scanId=scan&status=open&impact=minor,moderate"));
    expect(response.status).toBe(200);
    expect(mocks.filtered).toHaveBeenCalledWith({ scanId: "scan", status: "OPEN", impact: ["minor", "moderate"], page: 1, limit: 25 });
  });

  it("rejects invalid severity before querying violations", async () => {
    const response = await GET(new NextRequest("http://localhost/api/violations?scanId=scan&impact=unknown"));
    expect(response.status).toBe(400);
    expect(mocks.filtered).not.toHaveBeenCalled();
  });

  it("does not expose someone else's legacy scan violations", async () => {
    mocks.scan.mockResolvedValue({ id: "scan", workspaceId: null, userId: "other-user" });
    const response = await GET(new NextRequest("http://localhost/api/violations?scanId=scan"));
    expect(response.status).toBe(403);
    expect(mocks.filtered).not.toHaveBeenCalled();
  });

  it("allows the legacy owner to read violations", async () => {
    mocks.scan.mockResolvedValue({ id: "scan", workspaceId: null, userId: "member" });
    const response = await GET(new NextRequest("http://localhost/api/violations?scanId=scan"));
    expect(response.status).toBe(200);
    expect(mocks.filtered).toHaveBeenCalled();
  });
});