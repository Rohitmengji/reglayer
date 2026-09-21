import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ permission: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { email: "audit@example.test" } }) }));
vi.mock("@/lib/auth/config", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/api-guard", () => ({ requireWorkspacePermission: mocks.permission }));
import { POST } from "@/app/api/workflows/builder/run/route";

const node = (id: string, type = "action") => ({ id, type, position: { x: 0, y: 0 }, data: {} });
const edge = (source: string, target: string) => ({ id: `${source}-${target}`, source, target });
const request = (nodes: ReturnType<typeof node>[], edges: ReturnType<typeof edge>[]) => new NextRequest("http://localhost/api/workflows/builder/run", { method: "POST", body: JSON.stringify({ name: "Audit workflow", nodes, edges }) });

beforeEach(() => mocks.permission.mockResolvedValue({ ok: true, ctx: { workspaceId: "workspace-a" } }));

describe("Visual workflow preview contract", () => {
  it("never reports execution for a graph-only preview", async () => {
    const response = await POST(request([node("start", "trigger"), node("scan")], [edge("start", "scan")]));
    const body = await response.json();
    expect(body).toMatchObject({ status: "preview", executed: false, plannedNodes: ["start", "scan"] });
    expect(body.executedNodes).toBeUndefined();
    expect(body.runId).toBeUndefined();
  });

  it.each([
    { name: "duplicate ids", nodes: [node("start", "trigger"), node("start")], edges: [] },
    { name: "unknown edge target", nodes: [node("start", "trigger")], edges: [edge("start", "missing")] },
    { name: "cycle", nodes: [node("start", "trigger"), node("scan")], edges: [edge("start", "scan"), edge("scan", "start")] },
    { name: "disconnected step", nodes: [node("start", "trigger"), node("scan")], edges: [] },
    { name: "no trigger", nodes: [node("scan")], edges: [] },
  ])("rejects $name", async ({ nodes, edges }) => {
    const response = await POST(request(nodes, edges));
    expect(response.status).toBe(400);
  });

  it("lists converging branches once and only after their dependencies", async () => {
    const response = await POST(request(
      [node("start", "trigger"), node("left"), node("right"), node("join")],
      [edge("start", "left"), edge("start", "right"), edge("left", "join"), edge("right", "join")],
    ));
    expect((await response.json()).plannedNodes).toEqual(["start", "left", "right", "join"]);
  });
});