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
 * Workspace administrator = master admin OR workspace OWNER/ADMIN.
 *
 * This is the role set behind every OWNER/ADMIN-tier permission (content.edit,
 * scans.delete, schedules/integrations/apiKeys/settings.manage). Use it to gate
 * UI affordances whose server route requires one of those permissions, so the
 * client never offers an action the server will 403.
 */
export function isWorkspaceAdmin(session: SessionLike | null | undefined): boolean {
  const role = session?.user?.workspaceRole;
  return Boolean(session?.user?.isMasterAdmin) || role === "OWNER" || role === "ADMIN";
}

/**
 * Content (blog / CMS) editing rights. Mirrors the `content.edit` permission —
 * same OWNER/ADMIN-or-master role set; named separately so call sites read
 * intuitively.
 */
export function isContentEditor(session: SessionLike | null | undefined): boolean {
  return isWorkspaceAdmin(session);
}
