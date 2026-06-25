/**
 * RegLayer — SSO admin route guard (server-only)
 *
 * The single gate for every /api/sso/* admin endpoint. Enforces, in order:
 *   1. rate limit ("api" tier),
 *   2. `sso.manage` permission (OWNER/ADMIN or master admin) — also resolves the
 *      caller's workspace,
 *   3. the Enterprise `sso` feature on THAT workspace (master admin bypasses,
 *      matching requireFeature semantics).
 *
 * Returns the resolved workspaceId so routes scope every read/write to it — a
 * connection in another workspace is simply not found (404), never leaked.
 */
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit-middleware";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { hasFeature } from "@/lib/features/feature-access";

export type SsoAdminGuard =
  | { ok: true; ctx: { userId: string; email: string; workspaceId: string; isMasterAdmin: boolean } }
  | { ok: false; response: NextResponse };

export async function requireSsoAdmin(request: NextRequest): Promise<SsoAdminGuard> {
  const blocked = await applyRateLimit(request, "api");
  if (blocked) return { ok: false, response: blocked };

  const perm = await requireWorkspacePermission("sso.manage");
  if (!perm.ok) return { ok: false, response: perm.response };

  const workspaceId = perm.ctx.workspaceId;
  if (!workspaceId) {
    return { ok: false, response: NextResponse.json({ error: "No workspace" }, { status: 400 }) };
  }

  if (!perm.ctx.isMasterAdmin) {
    const feat = await hasFeature(workspaceId, "sso");
    if (!feat.enabled) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Feature not available", feature: "sso", reason: feat.reason }, { status: 403 }),
      };
    }
  }

  return { ok: true, ctx: { userId: perm.ctx.userId, email: perm.ctx.email, workspaceId, isMasterAdmin: perm.ctx.isMasterAdmin } };
}
