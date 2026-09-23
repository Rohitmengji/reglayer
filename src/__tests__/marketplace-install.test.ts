import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  permission: vi.fn(),
  itemFind: vi.fn(),
  itemUpdate: vi.fn(),
  workflowCreate: vi.fn(),
  createBlueprint: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth/config", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/api-guard", () => ({ requireWorkspacePermission: mocks.permission }));
vi.mock("@/lib/database/prisma", () => ({ prisma: {
  marketplaceItem: { findUnique: mocks.itemFind, update: mocks.itemUpdate },
  savedWorkflow: { create: mocks.workflowCreate },
} }));
vi.mock("@/lib/ai/marketplace/registry", () => ({ createBlueprint: mocks.createBlueprint }));
import { POST } from "@/app/api/marketplace/install/route";

const workflowItem = { id: "wf-1", type: "workflow", title: "Nightly Audit", description: "Runs a nightly scan", category: "Monitoring", definition: { nodes: [{ id: "a" }, { id: "b" }], edges: [{ id: "e" }] } };
const agentItem = { id: "ag-1", type: "agent", title: "Alt Text Author", description: "Writes alt text", category: "Accessibility", definition: { systemPrompt: "You write alt text.", model: "gpt-4o-mini", temperature: 0.4 } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { email: "admin@example.test" } });
  mocks.permission.mockResolvedValue({ ok: true, ctx: { userId: "user-1", workspaceId: "ws-1", isMasterAdmin: false } });
  mocks.itemUpdate.mockResolvedValue({});
  mocks.workflowCreate.mockResolvedValue({ id: "saved-1" });
  mocks.createBlueprint.mockResolvedValue({ id: "bp-1" });
});

const request = (body: object) => new NextRequest("http://localhost/api/marketplace/install", { method: "POST", body: JSON.stringify(body) });

describe("Marketplace install", () => {
  it("denies callers without settings.manage before touching any data", async () => {
    mocks.permission.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await POST(request({ itemId: "wf-1", type: "workflow" }))).status).toBe(403);
    expect(mocks.permission).toHaveBeenCalledWith("settings.manage");
    expect(mocks.itemFind).not.toHaveBeenCalled();
  });

  it("returns 404 and never increments downloads for a missing item", async () => {
    mocks.itemFind.mockResolvedValue(null);
    expect((await POST(request({ itemId: "nope", type: "workflow" }))).status).toBe(404);
    expect(mocks.itemUpdate).not.toHaveBeenCalled();
  });

  it("installs a workflow into the authorized workspace, then increments downloads", async () => {
    mocks.itemFind.mockResolvedValue(workflowItem);
    const res = await POST(request({ itemId: "wf-1", type: "workflow" }));
    expect(res.status).toBe(200);
    expect(mocks.workflowCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ workspaceId: "ws-1", createdBy: "user-1", nodeCount: 2, edgeCount: 1 }),
    }));
    expect(mocks.itemUpdate).toHaveBeenCalledWith({ where: { id: "wf-1" }, data: { downloads: { increment: 1 } } });
  });

  it("installs an agent as a workspace-scoped blueprint", async () => {
    mocks.itemFind.mockResolvedValue(agentItem);
    const res = await POST(request({ itemId: "ag-1", type: "agent" }));
    expect(res.status).toBe(200);
    expect(mocks.createBlueprint).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "ws-1", createdBy: "user-1", systemPrompt: "You write alt text.",
    }));
    expect(mocks.itemUpdate).toHaveBeenCalledTimes(1);
  });

  it("rejects an agent with no configuration and does not inflate downloads", async () => {
    mocks.itemFind.mockResolvedValue({ ...agentItem, definition: {} });
    expect((await POST(request({ itemId: "ag-1", type: "agent" }))).status).toBe(422);
    expect(mocks.createBlueprint).not.toHaveBeenCalled();
    expect(mocks.itemUpdate).not.toHaveBeenCalled();
  });

  it("returns 409 when the agent blueprint already exists", async () => {
    mocks.itemFind.mockResolvedValue(agentItem);
    mocks.createBlueprint.mockRejectedValue(new Error("Unique constraint failed"));
    expect((await POST(request({ itemId: "ag-1", type: "agent" }))).status).toBe(409);
    expect(mocks.itemUpdate).not.toHaveBeenCalled();
  });

  it("reports that rule installs are not available yet without inflating downloads", async () => {
    mocks.itemFind.mockResolvedValue({ id: "ru-1", type: "rule", title: "A Rule", description: "desc", category: "Accessibility", definition: {} });
    expect((await POST(request({ itemId: "ru-1", type: "rule" }))).status).toBe(400);
    expect(mocks.itemUpdate).not.toHaveBeenCalled();
  });
});
