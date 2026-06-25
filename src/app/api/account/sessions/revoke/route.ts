/**
 * POST /api/account/sessions/revoke — "sign out everywhere" / deprovision.
 *
 * Sets the caller's `sessionsRevokedAt` so all JWTs issued before now are
 * rejected by the auth `jwt` callback (review #1). Self-serve here; the SSO
 * deprovisioning path (SCIM, future) will call the same `revokeUserSessions`.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { revokeUserSessions } from "@/lib/auth/revocation";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  await revokeUserSessions(session.user.email);
  return NextResponse.json({ ok: true });
}
