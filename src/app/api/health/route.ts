/**
 * ---------------------------------------------------------
 * RegLayer — Health Check API
 * ---------------------------------------------------------
 *
 * Purpose:
 * System health endpoint for monitoring and load balancers.
 *
 * Returns service status, uptime, and dependency health.
 * ---------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/prisma";

export async function GET() {
  let dbStatus = "healthy";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "unhealthy";
  }

  const status = dbStatus === "healthy" ? "healthy" : "degraded";

  return NextResponse.json(
    {
      status,
      service: "reglayer",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      dependencies: { database: dbStatus },
    },
    { status: status === "healthy" ? 200 : 503 }
  );
}
