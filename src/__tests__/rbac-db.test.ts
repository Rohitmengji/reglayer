import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/database/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    workspaceMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    workspace: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/database/prisma";
import { getUserContext, isMasterAdmin, getAccessibleWorkspaces } from "@/lib/auth/rbac";

describe("RBAC — getUserContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when user not found", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const result = await getUserContext("nonexistent");
    expect(result).toBeNull();
  });

  it("returns MASTER_ADMIN system role for master admin users", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "admin1",
      email: "admin@reglayer.dev",
      isMasterAdmin: true,
    } as any);

    const result = await getUserContext("admin1");

    expect(result).not.toBeNull();
    expect(result!.systemRole).toBe("MASTER_ADMIN");
    expect(result!.workspaceRole).toBeNull();
  });

  it("returns USER system role for regular users", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user1",
      email: "user@test.com",
      isMasterAdmin: false,
    } as any);

    const result = await getUserContext("user1");

    expect(result!.systemRole).toBe("USER");
  });

  it("includes workspace role when workspaceId provided", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user1",
      email: "user@test.com",
      isMasterAdmin: false,
    } as any);
    vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
      role: "ADMIN",
    } as any);

    const result = await getUserContext("user1", "ws_123");

    expect(result!.workspaceRole).toBe("ADMIN");
  });

  it("returns null workspace role when user has no membership", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user1",
      email: "user@test.com",
      isMasterAdmin: false,
    } as any);
    vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue(null);

    const result = await getUserContext("user1", "ws_123");

    expect(result!.workspaceRole).toBeNull();
  });
});

describe("RBAC — isMasterAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true for master admin", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      isMasterAdmin: true,
    } as any);

    expect(await isMasterAdmin("admin1")).toBe(true);
  });

  it("returns false for regular user", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      isMasterAdmin: false,
    } as any);

    expect(await isMasterAdmin("user1")).toBe(false);
  });

  it("returns false when user not found", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    expect(await isMasterAdmin("nonexistent")).toBe(false);
  });
});

describe("RBAC — getAccessibleWorkspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns all workspaces for master admin", async () => {
    const mockWorkspaces = [
      { id: "ws_1", name: "Workspace 1" },
      { id: "ws_2", name: "Workspace 2" },
    ];
    vi.mocked(prisma.workspace.findMany).mockResolvedValue(mockWorkspaces as any);

    const result = await getAccessibleWorkspaces("admin1", true);

    expect(result).toHaveLength(2);
    expect(prisma.workspace.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.any(Object),
      })
    );
  });

  it("returns only user workspaces for regular users", async () => {
    const mockMemberships = [
      { workspace: { id: "ws_1", name: "My Workspace" }, role: "MEMBER" },
    ];
    (prisma.workspaceMember as any).findMany.mockResolvedValue(mockMemberships as any);

    const result = await getAccessibleWorkspaces("user1", false);

    expect(result).toBeDefined();
    expect((prisma.workspaceMember as any).findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user1" },
      })
    );
  });
});
