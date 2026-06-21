/**
 * RegLayer — Client-safe role predicate tests
 *
 * WHY: isWorkspaceAdmin / isContentEditor gate UI affordances off the session.
 *      They must exactly mirror the OWNER/ADMIN-or-master server permission set
 *      so the client never offers an action the server will 403 (and never hides
 *      one a real admin is entitled to — the bug that prompted retiring the
 *      legacy lowercase `role` check).
 * WHAT: Pure-function tests over session-shaped inputs. No DB, no server imports.
 */
import { describe, it, expect } from "vitest";
import { isWorkspaceAdmin, isContentEditor } from "@/lib/auth/roles";

describe("roles - isWorkspaceAdmin", () => {
  it("is true for master admin regardless of workspace role", () => {
    expect(isWorkspaceAdmin({ user: { isMasterAdmin: true, workspaceRole: null } })).toBe(true);
    expect(isWorkspaceAdmin({ user: { isMasterAdmin: true, workspaceRole: "VIEWER" } })).toBe(true);
  });

  it("is true for workspace OWNER and ADMIN", () => {
    expect(isWorkspaceAdmin({ user: { workspaceRole: "OWNER" } })).toBe(true);
    expect(isWorkspaceAdmin({ user: { workspaceRole: "ADMIN" } })).toBe(true);
  });

  it("is false for MEMBER, VIEWER, and no role", () => {
    expect(isWorkspaceAdmin({ user: { workspaceRole: "MEMBER" } })).toBe(false);
    expect(isWorkspaceAdmin({ user: { workspaceRole: "VIEWER" } })).toBe(false);
    expect(isWorkspaceAdmin({ user: { workspaceRole: null } })).toBe(false);
  });

  it("is false for null/undefined/empty session", () => {
    expect(isWorkspaceAdmin(null)).toBe(false);
    expect(isWorkspaceAdmin(undefined)).toBe(false);
    expect(isWorkspaceAdmin({})).toBe(false);
    expect(isWorkspaceAdmin({ user: null })).toBe(false);
  });

  it("does NOT honor the legacy lowercase role string", () => {
    // The retired bug: a real workspace ADMIN has workspaceRole 'ADMIN', never
    // the legacy lowercase 'admin'. A lowercase value must not grant admin UI.
    expect(isWorkspaceAdmin({ user: { workspaceRole: "admin" } })).toBe(false);
    expect(isWorkspaceAdmin({ user: { workspaceRole: "owner" } })).toBe(false);
  });
});

describe("roles - isContentEditor", () => {
  it("matches isWorkspaceAdmin exactly (same role set)", () => {
    const cases = [
      { user: { isMasterAdmin: true } },
      { user: { workspaceRole: "OWNER" } },
      { user: { workspaceRole: "ADMIN" } },
      { user: { workspaceRole: "MEMBER" } },
      { user: { workspaceRole: "VIEWER" } },
      null,
      undefined,
      {},
    ];
    for (const c of cases) {
      expect(isContentEditor(c)).toBe(isWorkspaceAdmin(c));
    }
  });
});
