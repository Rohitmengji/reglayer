import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth/config", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/api-guard", () => ({ requireWorkspacePermission: vi.fn() }));
vi.mock("@/lib/rate-limit-middleware", () => ({ applyRateLimit: vi.fn() }));
vi.mock("@/lib/database/prisma", () => ({ prisma: {
  marketplaceItem: { findMany: mocks.findMany, count: mocks.count },
} }));
import { GET } from "@/app/api/marketplace/route";

const req = (qs = "") => new NextRequest(`http://localhost/api/marketplace${qs}`);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { email: "u@example.test" } });
  mocks.findMany.mockResolvedValue([{ id: "a" }]);
  mocks.count.mockResolvedValue(1);
});

describe("Marketplace browse", () => {
  it("requires a session", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("returns an accurate total and hasMore=false on the last page", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.hasMore).toBe(false);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 30 }));
  });

  it("paginates with skip/take and reports hasMore when more remain", async () => {
    mocks.findMany.mockResolvedValue(new Array(24).fill({ id: "x" }));
    mocks.count.mockResolvedValue(50);
    const body = await (await GET(req("?limit=24&offset=24"))).json();
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 24, take: 24 }));
    expect(body.hasMore).toBe(true); // 24 + 24 < 50
  });

  it("counts with the same where clause it queries", async () => {
    await GET(req("?type=agent&category=Legal&q=Audit"));
    const where = mocks.findMany.mock.calls[0][0].where;
    expect(where.type).toBe("agent");
    expect(where.category).toBe("Legal");
    expect(Array.isArray(where.OR)).toBe(true);
    expect(mocks.count).toHaveBeenCalledWith({ where });
  });

  it("caps the page size at 100", async () => {
    await GET(req("?limit=9999"));
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
  });
});
