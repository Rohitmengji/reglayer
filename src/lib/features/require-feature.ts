/**
 * RegLayer — Route Feature Guard (Server-Side)
 *
 * Single entry point for API routes to verify feature access.
 * Resolves session → user → workspace → feature in one call path.
 * Returns user context on success so routes don't need to re-query.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { hasFeature } from "./feature-access";

interface FeatureGuardSuccess {
  allowed: true;
  userId: string;
  workspaceId: string;
  isMasterAdmin: boolean;
}

interface FeatureGuardDenied {
  allowed: false;
  response: NextResponse;
}

type FeatureGuardResult = FeatureGuardSuccess | FeatureGuardDenied;

/**
 * Verify the current user has access to `featureId`.
 *
 * On success, returns userId + workspaceId so the route doesn't
 * need to call getServerSession/prisma.user.findUnique again.
 */
export async function requireFeature(featureId: string): Promise<FeatureGuardResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { allowed: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, isMasterAdmin: true, memberships: { select: { workspaceId: true }, take: 1 } },
  });

  if (!user) {
    return { allowed: false, response: NextResponse.json({ error: "User not found" }, { status: 404 }) };
  }

  // Master admins bypass all feature gates
  if (user.isMasterAdmin) {
    return { allowed: true, userId: user.id, workspaceId: user.memberships[0]?.workspaceId ?? "", isMasterAdmin: true };
  }

  const workspaceId = user.memberships[0]?.workspaceId;
  if (!workspaceId) {
    return { allowed: false, response: NextResponse.json({ error: "No workspace" }, { status: 403 }) };
  }

  const access = await hasFeature(workspaceId, featureId);
  if (!access.enabled) {
    return {
      allowed: false,
      response: NextResponse.json(
        { error: "Feature not available", feature: featureId, reason: access.reason },
        { status: 403 }
      ),
    };
  }

  return { allowed: true, userId: user.id, workspaceId, isMasterAdmin: false };
}
