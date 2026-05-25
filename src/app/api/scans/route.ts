import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/prisma";

export async function GET(request: NextRequest) {
  try {
    const limit = Number(request.nextUrl.searchParams.get("limit")) || 50;
    const url = request.nextUrl.searchParams.get("url");

    const where = url ? { url, status: "COMPLETED" as const } : {};

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
