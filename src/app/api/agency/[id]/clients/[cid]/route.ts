/**
 * RegLayer — Agency Client Delete API Route
 *
 * DELETE: Remove a client from an agency
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; cid: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id, cid } = await params;

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, isMasterAdmin: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify ownership
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

    // Verify client belongs to this agency
    const client = await prisma.agencyClient.findFirst({
      where: { id: cid, agencyId: id },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    await prisma.agencyClient.delete({ where: { id: cid } });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
