/**
 * Client-safe role predicates — derived from the NextAuth session ONLY.
 *
 * No prisma / server imports live here, so this module is safe to import from
 * client components. The canonical authority is always the server (rbac.ts →
 * hasPermission); these helpers exist purely to gate UI affordances off the
 * SAME signals the server enforces, so the client never offers an action the
 * server will reject with a 403.
 */

interface SessionLike {
  user?: {
    isMasterAdmin?: boolean | null;
    workspaceRole?: string | null;
  } | null;
}

/**
 * Content (blog / CMS) editing rights = master admin OR workspace OWNER/ADMIN.
 * Mirrors the `content.edit` permission in rbac.ts.
 */
export function isContentEditor(session: SessionLike | null | undefined): boolean {
  const role = session?.user?.workspaceRole;
  return Boolean(session?.user?.isMasterAdmin) || role === "OWNER" || role === "ADMIN";
}
