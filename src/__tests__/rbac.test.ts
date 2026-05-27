import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", () => ({
  prisma: {},
}));

import {
  hasPermission,
  getPermissions,
  canAssignRole,
  canManageUser,
  requirePermission,
} from "@/lib/auth/rbac";

// Note: We only test the pure functions here (no DB calls)

describe("RBAC - hasPermission", () => {
  it("MASTER_ADMIN has all permissions", () => {
    expect(hasPermission("MASTER_ADMIN", null, "workspace.manage")).toBe(true);
    expect(hasPermission("MASTER_ADMIN", null, "admin.allWorkspaces")).toBe(true);
    expect(hasPermission("MASTER_ADMIN", null, "workspace.delete")).toBe(true);
  });

  it("USER with no workspace role has no permissions", () => {
    expect(hasPermission("USER", null, "scans.view")).toBe(false);
    expect(hasPermission("USER", null, "scans.run")).toBe(false);
  });

  it("OWNER has full workspace permissions", () => {
    expect(hasPermission("USER", "OWNER", "workspace.manage")).toBe(true);
    expect(hasPermission("USER", "OWNER", "workspace.delete")).toBe(true);
    expect(hasPermission("USER", "OWNER", "members.invite")).toBe(true);
    expect(hasPermission("USER", "OWNER", "scans.run")).toBe(true);
    expect(hasPermission("USER", "OWNER", "integrations.manage")).toBe(true);
  });

  it("ADMIN has manage permissions but cannot delete workspace", () => {
    expect(hasPermission("USER", "ADMIN", "workspace.manage")).toBe(true);
    expect(hasPermission("USER", "ADMIN", "workspace.delete")).toBe(false);
    expect(hasPermission("USER", "ADMIN", "members.invite")).toBe(true);
    expect(hasPermission("USER", "ADMIN", "scans.run")).toBe(true);
  });

  it("MEMBER can only run and view scans", () => {
    expect(hasPermission("USER", "MEMBER", "scans.run")).toBe(true);
    expect(hasPermission("USER", "MEMBER", "scans.view")).toBe(true);
    expect(hasPermission("USER", "MEMBER", "members.invite")).toBe(false);
    expect(hasPermission("USER", "MEMBER", "settings.manage")).toBe(false);
  });

  it("VIEWER can only view scans", () => {
    expect(hasPermission("USER", "VIEWER", "scans.view")).toBe(true);
    expect(hasPermission("USER", "VIEWER", "scans.run")).toBe(false);
    expect(hasPermission("USER", "VIEWER", "workspace.manage")).toBe(false);
  });
});

describe("RBAC - getPermissions", () => {
  it("MASTER_ADMIN gets all permissions", () => {
    const perms = getPermissions("MASTER_ADMIN", null);
    expect(perms).toContain("admin.allWorkspaces");
    expect(perms).toContain("admin.managePlans");
    expect(perms).toContain("workspace.delete");
  });

  it("USER with no role gets empty array", () => {
    const perms = getPermissions("USER", null);
    expect(perms).toEqual([]);
  });

  it("MEMBER gets limited permissions", () => {
    const perms = getPermissions("USER", "MEMBER");
    expect(perms).toEqual(["scans.run", "scans.view"]);
  });
});

describe("RBAC - canAssignRole", () => {
  it("MASTER_ADMIN can assign any role", () => {
    expect(canAssignRole("MASTER_ADMIN", null, "OWNER")).toBe(true);
    expect(canAssignRole("MASTER_ADMIN", null, "ADMIN")).toBe(true);
    expect(canAssignRole("MASTER_ADMIN", null, "VIEWER")).toBe(true);
  });

  it("OWNER can assign ADMIN, MEMBER, VIEWER but not OWNER", () => {
    expect(canAssignRole("USER", "OWNER", "ADMIN")).toBe(true);
    expect(canAssignRole("USER", "OWNER", "MEMBER")).toBe(true);
    expect(canAssignRole("USER", "OWNER", "VIEWER")).toBe(true);
    expect(canAssignRole("USER", "OWNER", "OWNER")).toBe(false);
  });

  it("ADMIN can assign MEMBER and VIEWER", () => {
    expect(canAssignRole("USER", "ADMIN", "MEMBER")).toBe(true);
    expect(canAssignRole("USER", "ADMIN", "VIEWER")).toBe(true);
    expect(canAssignRole("USER", "ADMIN", "ADMIN")).toBe(false);
    expect(canAssignRole("USER", "ADMIN", "OWNER")).toBe(false);
  });

  it("MEMBER and VIEWER cannot assign roles", () => {
    expect(canAssignRole("USER", "MEMBER", "VIEWER")).toBe(false);
    expect(canAssignRole("USER", "VIEWER", "VIEWER")).toBe(false);
  });
});

describe("RBAC - canManageUser", () => {
  it("OWNER can manage all lower roles", () => {
    expect(canManageUser("OWNER", "ADMIN")).toBe(true);
    expect(canManageUser("OWNER", "MEMBER")).toBe(true);
    expect(canManageUser("OWNER", "VIEWER")).toBe(true);
  });

  it("ADMIN can manage MEMBER and VIEWER", () => {
    expect(canManageUser("ADMIN", "MEMBER")).toBe(true);
    expect(canManageUser("ADMIN", "VIEWER")).toBe(true);
  });

  it("cannot manage same or higher role", () => {
    expect(canManageUser("ADMIN", "ADMIN")).toBe(false);
    expect(canManageUser("ADMIN", "OWNER")).toBe(false);
    expect(canManageUser("MEMBER", "ADMIN")).toBe(false);
    expect(canManageUser("VIEWER", "OWNER")).toBe(false);
  });
});

describe("RBAC - requirePermission", () => {
  it("does not throw when permission is granted", () => {
    expect(() =>
      requirePermission("MASTER_ADMIN", null, "workspace.delete")
    ).not.toThrow();
  });

  it("throws when permission is denied", () => {
    expect(() =>
      requirePermission("USER", "VIEWER", "scans.run")
    ).toThrow("Forbidden: requires 'scans.run' permission");
  });
});
