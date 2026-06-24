/**
 * RegLayer — Agency Clients API Route
 *
 * POST: Add a new client to an agency (creates workspace + client record)
 * GET: List clients for an agency
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { addClientSchema } from "@/lib/validations/agency";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, isMasterAdmin: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify ownership + check client limit
    const agency = await prisma.agency.findUnique({
      where: { id },
      include: { _count: { select: { clients: true } } },
    });

    if (!agency) {
      return NextResponse.json({ error: "Agency not found" }, { status: 404 });
    }

    if (!user.isMasterAdmin && agency.ownerId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (agency._count.clients >= agency.maxClients) {
      return NextResponse.json(
        { error: `Client limit reached (${agency.maxClients}). Upgrade your plan.` },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = addClientSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { clientName, contactEmail, workspaceName } = parsed.data;

    // Generate a unique slug from client name
    const slug = clientName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) + "-" + Date.now().toString(36);

    // Create workspace + client record in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name: workspaceName || clientName,
          slug,
        },
      });

      const client = await tx.agencyClient.create({
        data: {
          agencyId: id,
          workspaceId: workspace.id,
          clientName,
          contactEmail,
        },
      });

      // Grant the agency owner OWNER access to the new client workspace.
      // Without this the workspace has no WorkspaceMember at all, so it is
      // unreachable (every workspace query is gated through workspaceMember) —
      // the client could be "added" but never opened or managed.
      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: agency.ownerId,
          role: "OWNER",
        },
      });

      return { workspace, client };
    });

    return NextResponse.json(
      { client: result.client, workspace: result.workspace },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, isMasterAdmin: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const agency = await prisma.agency.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    if (!agency) {
      return NextResponse.json({ error: "Agency not found" }, { status: 404 });
    }

    if (!user.isMasterAdmin && agency.ownerId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const clients = await prisma.agencyClient.findMany({
      where: { agencyId: id },
      include: {
        workspace: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: { addedAt: "desc" },
    });

    return NextResponse.json({ clients });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
