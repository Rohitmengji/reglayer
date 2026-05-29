/**
 * RegLayer — Auth Config by ID (DELETE)
 *
 * WHY: Users must be able to delete saved credentials at any time (GDPR compliance,
 *      credential rotation, security hygiene).
 *
 * WHAT: DELETE /api/auth-configs/[id] — Permanently removes a saved auth config.
 *
 * Security: Verifies workspace ownership before deletion.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/auth-configs/[id] — Delete a saved auth config
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, memberships: { select: { workspaceId: true }, take: 1 } },
  });

  if (!user || !user.memberships[0]) {
    return NextResponse.json({ error: "User or workspace not found" }, { status: 404 });
  }

  const workspaceId = user.memberships[0].workspaceId;

  // Verify the config belongs to this workspace (IDOR protection)
  const config = await prisma.authConfig.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });

  if (!config) {
    return NextResponse.json({ error: "Auth config not found" }, { status: 404 });
  }

  await prisma.authConfig.delete({ where: { id } });

  return NextResponse.json({ deleted: true }, { status: 200 });
}
