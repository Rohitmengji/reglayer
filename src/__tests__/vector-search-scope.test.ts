import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const mocks = vi.hoisted(() => ({ query: vi.fn(), embed: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", () => ({ prisma: { $queryRaw: mocks.query } }));
vi.mock("@/lib/ai/gateway", () => ({ embed: mocks.embed }));
import { searchViolations } from "@/lib/ai/vector/search";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.query.mockResolvedValueOnce([{ exists: true }]).mockResolvedValue([]);
  mocks.embed.mockResolvedValue({ embeddings: [[0.1, 0.2]] });
});

describe("Vector search workspace query contract", () => {
  it("rejects missing scope before database or provider access", async () => {
    await expect(searchViolations("contrast", { workspaceId: "" })).rejects.toThrow("Workspace scope");
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.embed).not.toHaveBeenCalled();
  });

  it("binds workspace and scan in both existence and similarity SQL", async () => {
    await searchViolations("contrast", { workspaceId: "workspace-a", scanId: "scan-a", limit: 5 });
    expect(mocks.query).toHaveBeenCalledTimes(2);
    for (const [query] of mocks.query.mock.calls as [Prisma.Sql][]) {
      expect(query.text).toContain('"workspaceId"');
      expect(query.values).toContain("workspace-a");
      expect(query.values).toContain("scan-a");
      expect(query.text).not.toContain("workspace-a");
    }
    expect(mocks.query.mock.calls[0][0].text).toContain("SELECT EXISTS");
  });

  it("does not embed when this workspace has no indexed findings", async () => {
    mocks.query.mockReset().mockResolvedValue([{ exists: false }]);
    expect(await searchViolations("contrast", { workspaceId: "empty-workspace" })).toEqual([]);
    expect(mocks.embed).not.toHaveBeenCalled();
  });

  it("propagates database failures rather than returning a false empty result", async () => {
    mocks.query.mockReset().mockRejectedValue(new Error("unavailable"));
    await expect(searchViolations("contrast", { workspaceId: "workspace-a" })).rejects.toThrow("unavailable");
  });

  it("reports unavailable embeddings rather than empty matches", async () => {
    mocks.embed.mockResolvedValue(null);
    await expect(searchViolations("contrast", { workspaceId: "workspace-a" })).rejects.toThrow("embedding unavailable");
  });
});