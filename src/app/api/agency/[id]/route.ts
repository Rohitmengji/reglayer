/**
 * RegLayer — Agency Detail API Route
 *
 * GET: Get agency details (owner only)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";

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
      include: {
        clients: {
          include: {
            workspace: {
              select: { id: true, name: true, slug: true },
            },
          },
          orderBy: { addedAt: "desc" },
        },
        apiKeys: {
          select: {
            id: true,
            keyPrefix: true,
            label: true,
            lastUsedAt: true,
            expiresAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        _count: { select: { clients: true } },
      },
    });

    if (!agency) {
      return NextResponse.json({ error: "Agency not found" }, { status: 404 });
    }

    // Verify ownership
    if (!user.isMasterAdmin && agency.ownerId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ agency });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
