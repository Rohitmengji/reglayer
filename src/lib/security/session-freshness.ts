/**
 * Session freshness verification for sensitive operations.
 *
 * WHY: JWT tokens remain valid after session revocation until they expire.
 *      The JWT callback strips roles but doesn't reject the token entirely.
 *      Sensitive endpoints (billing, admin, SSO, API keys) must verify that
 *      the session was issued AFTER the last revocation.
 *
 * WHAT: Database lookup of `sessionsRevokedAt` compared against token `iat`.
 * HOW: Call `assertSessionFresh(request)` on sensitive endpoints.
 *      Returns error response if session was issued before revocation.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/prisma";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

/**
 * Verify that the current session was not issued before a revocation event.
 * Use on sensitive endpoints: billing, admin, API key management, SSO config.
 *
 * @returns null if session is fresh, or an error Response if revoked.
 */
export async function assertSessionFresh(request: NextRequest): Promise<NextResponse | null> {
  const token = await getToken({ req: request });
  if (!token?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const iat = (token as { iat?: number }).iat;
  if (typeof iat !== "number") {
    return NextResponse.json({ error: "Session expired. Please sign in again." }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: token.email },
      select: { sessionsRevokedAt: true },
    });

    if (user?.sessionsRevokedAt) {
      const revokedAtSec = Math.floor(user.sessionsRevokedAt.getTime() / 1000);
      if (iat < revokedAtSec) {
        return NextResponse.json(
          { error: "Session revoked. Please sign in again." },
          { status: 401 }
        );
      }
    }
  } catch {
    // DB lookup failed — fail open for session check (revocation is defense-in-depth).
  }

  return null;
}
