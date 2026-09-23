import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  permission: vi.fn(),
  workflowFind: vi.fn(),
  itemCreate: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth/config", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/api-guard", () => ({ requireWorkspacePermission: mocks.permission }));
vi.mock("@/lib/database/prisma", () => ({ prisma: {
  savedWorkflow: { findFirst: mocks.workflowFind },
  marketplaceItem: { create: mocks.itemCreate },
} }));
import { POST } from "@/app/api/marketplace/route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { email: "author@example.test", name: "Author" } });
  mocks.permission.mockResolvedValue({ ok: true, ctx: { userId: "user-1", workspaceId: "ws-1", isMasterAdmin: false } });
  mocks.workflowFind.mockResolvedValue({ definition: { nodes: [{ id: "a" }], edges: [] } });
  mocks.itemCreate.mockResolvedValue({ id: "item-1", title: "My Flow" });
});

const request = (body: object) => new NextRequest("http://localhost/api/marketplace", { method: "POST", body: JSON.stringify(body) });
const base = { type: "workflow", title: "My Flow", description: "A genuinely useful flow", category: "Monitoring" };

describe("Marketplace publish", () => {
  it("denies callers without settings.manage", async () => {
    mocks.permission.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await POST(request({ ...base, sourceWorkflowId: "wf-9" }))).status).toBe(403);
    expect(mocks.itemCreate).not.toHaveBeenCalled();
  });

  it("publishes a saved workflow using its own definition, scoped to the workspace", async () => {
    const res = await POST(request({ ...base, sourceWorkflowId: "wf-9" }));
    expect(res.status).toBe(201);
    expect(mocks.workflowFind).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "wf-9", workspaceId: "ws-1" },
    }));
    expect(mocks.itemCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ authorId: "user-1", workspaceId: "ws-1", definition: { nodes: [{ id: "a" }], edges: [] } }),
    }));
  });

  it("returns 404 for a workflow outside the caller's workspace and never publishes", async () => {
    mocks.workflowFind.mockResolvedValue(null);
    expect((await POST(request({ ...base, sourceWorkflowId: "foreign" }))).status).toBe(404);
    expect(mocks.itemCreate).not.toHaveBeenCalled();
  });

  it("rejects a publish with no definition and no source workflow", async () => {
    expect((await POST(request(base))).status).toBe(400);
    expect(mocks.itemCreate).not.toHaveBeenCalled();
  });
});
