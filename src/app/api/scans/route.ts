import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const limit = Number(request.nextUrl.searchParams.get("limit")) || 50;
    const url = request.nextUrl.searchParams.get("url");

    // Scope to user's workspace
    const membership = await prisma.workspaceMember.findFirst({
      where: { user: { email: session.user.email } },
      select: { workspaceId: true },
    });

    const where = {
      ...(url ? { url, status: "COMPLETED" as const } : {}),
      ...(membership ? { workspaceId: membership.workspaceId } : {}),
    };

    const scans = await prisma.scan.findMany({
      where,
      select: {
        id: true,
        url: true,
        score: true,
        totalViolations: true,
        critical: true,
        serious: true,
        moderate: true,
        minor: true,
        compliance: true,
        pageTitle: true,
        duration: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ scans, count: scans.length });
  } catch {
    return NextResponse.json({ error: "Failed to load scans", scans: [] }, { status: 500 });
  }
}
