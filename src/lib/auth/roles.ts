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
 *
 * Typed as a type guard: passing it (or surviving a `!` early-return) narrows
 * `session` to non-null with a present `user`, so server routes can then read
 * `session.user.id` without an extra null check.
 */
export function isWorkspaceAdmin<T extends SessionLike>(
  session: T | null | undefined
): session is T & { user: NonNullable<T["user"]> } {
  const role = session?.user?.workspaceRole;
  return Boolean(session?.user?.isMasterAdmin) || role === "OWNER" || role === "ADMIN";
}

/**
 * Content (blog / CMS) editing rights. Mirrors the `content.edit` permission —
 * same OWNER/ADMIN-or-master role set; named separately so call sites read
 * intuitively.
 */
export function isContentEditor<T extends SessionLike>(
  session: T | null | undefined
): session is T & { user: NonNullable<T["user"]> } {
  return isWorkspaceAdmin(session);
}
