/**
 * RegLayer — Workspace Features API
 *
 * GET /api/workspace/features — Get enabled features for current user's workspace (used by sidebar)
 * PUT /api/workspace/features — Master admin: grant/revoke features for a workspace
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { getWorkspaceFeatures, getWorkspaceFeaturesDetailed } from "@/lib/features/feature-access";
import { z } from "zod";

/**
 * GET — Returns enabled feature IDs for the user's workspace.
 * If ?workspaceId=xxx&detailed=true (master admin), returns full feature matrix.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { memberships: { include: { workspace: true } } },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const targetWorkspaceId = searchParams.get("workspaceId");
  const detailed = searchParams.get("detailed") === "true";

  // Master admin can query any workspace
  if (targetWorkspaceId && detailed) {
    if (!user.isMasterAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const features = await getWorkspaceFeaturesDetailed(targetWorkspaceId);
    return NextResponse.json({ features });
  }

  // Regular user: get their workspace features
  const membership = user.memberships[0];
  if (!membership) {
    return NextResponse.json({ features: [] });
  }

  const features = await getWorkspaceFeatures(membership.workspaceId);
  return NextResponse.json({ features, plan: membership.workspace.plan });
}

const updateSchema = z.object({
  workspaceId: z.string().min(1),
  feature: z.string().min(1),
  enabled: z.boolean(),
  expiresAt: z.string().datetime().nullable().optional(),
  note: z.string().max(500).optional(),
});

/**
 * PUT — Master admin: grant or revoke a feature for a workspace.
 */
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, isMasterAdmin: true },
  });

  if (!user?.isMasterAdmin) {
    return NextResponse.json({ error: "Forbidden — master admin only" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { workspaceId, feature, enabled, expiresAt, note } = parsed.data;

  // Verify workspace exists
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Upsert the feature override
  const override = await prisma.workspaceFeature.upsert({
    where: { workspaceId_feature: { workspaceId, feature } },
    create: {
      workspaceId,
      feature,
      enabled,
      grantedBy: user.id,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      note: note || null,
    },
    update: {
      enabled,
      grantedBy: user.id,
      grantedAt: new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      note: note || null,
    },
  });

  return NextResponse.json({
    success: true,
    override: {
      feature: override.feature,
      enabled: override.enabled,
      expiresAt: override.expiresAt,
      note: override.note,
    },
  });
}

/**
 * DELETE — Master admin: remove a feature override (revert to plan default).
 */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, isMasterAdmin: true },
  });

  if (!user?.isMasterAdmin) {
    return NextResponse.json({ error: "Forbidden — master admin only" }, { status: 403 });
  }

  const { workspaceId, feature } = await request.json();

  if (!workspaceId || !feature) {
    return NextResponse.json({ error: "workspaceId and feature required" }, { status: 400 });
  }

  await prisma.workspaceFeature.deleteMany({
    where: { workspaceId, feature },
  });

  return NextResponse.json({ success: true, reverted: feature });
}
