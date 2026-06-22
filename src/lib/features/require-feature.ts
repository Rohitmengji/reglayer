/**
 * RegLayer — Route Feature Guard (Server-Side)
 *
 * Single entry point for API routes to verify feature access.
 * Resolves session → user → ACTIVE workspace → feature in one call path.
 * Returns user context on success so routes don't need to re-query.
 *
 * Active workspace: honors the `reglayer-workspace` cookie (the workspace the
 * user is actually viewing) when it's one of their memberships, falling back to
 * their first membership. Gating against the wrong workspace's plan was a real
 * bug for multi-workspace users.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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

const WORKSPACE_COOKIE = "reglayer-workspace";

/** Resolve the user's active workspace: cookie if it's a valid membership, else first. */
async function resolveActiveWorkspaceId(memberships: { workspaceId: string }[]): Promise<string | undefined> {
  if (memberships.length === 0) return undefined;
  const active = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  if (active && memberships.some((m) => m.workspaceId === active)) return active;
  return memberships[0].workspaceId;
}

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
    select: { id: true, isMasterAdmin: true, memberships: { select: { workspaceId: true } } },
  });

  if (!user) {
    return { allowed: false, response: NextResponse.json({ error: "User not found" }, { status: 404 }) };
  }

  const workspaceId = await resolveActiveWorkspaceId(user.memberships);

  // Master admins bypass all feature gates (still resolve a workspace for scoping).
  if (user.isMasterAdmin) {
    return { allowed: true, userId: user.id, workspaceId: workspaceId ?? "", isMasterAdmin: true };
  }

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
