/**
 * RegLayer — Session revocation  [review #1]
 *
 * Sets `User.sessionsRevokedAt = now` so every JWT issued before that instant is
 * rejected by the `jwt` callback (deprovisioning / "sign out everywhere"). Busts
 * the 60s `auth:ctx` cache so revocation takes effect immediately rather than on
 * the next cache expiry.
 *
 * NOTE (honest scope): with the current NextAuth v4 JWT strategy this immediately
 * strips elevated context (master-admin / workspace role) from a revoked token;
 * full hard session termination across all routes wants DB sessions (Auth.js v5,
 * review #11). Tracked as the follow-up.
 */
import "server-only";
import { prisma } from "@/lib/database/prisma";
import { cacheDel } from "@/lib/cache/redis";

const AUTH_CTX_PREFIX = "auth:ctx:";

/** Revoke all of a user's current sessions. Safe to call repeatedly. */
export async function revokeUserSessions(email: string): Promise<void> {
  await prisma.user.update({
    where: { email },
    data: { sessionsRevokedAt: new Date() },
  });
  // Invalidate the cached auth context so the new revocation is seen at once.
  await cacheDel(`${AUTH_CTX_PREFIX}${email}`).catch(() => {});
}
