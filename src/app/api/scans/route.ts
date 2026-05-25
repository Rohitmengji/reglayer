import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/prisma";

export async function GET() {
  const scans = await prisma.scan.findMany({
    select: { id: true, url: true, score: true, pageTitle: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return NextResponse.json({ scans, count: scans.length });
}
