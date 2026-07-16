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
import { getRedis } from "@/lib/cache/redis";

export async function GET() {
  let dbStatus = "healthy";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "unhealthy";
  }

  let redisStatus: "healthy" | "unavailable" | "not_configured" = "not_configured";
  const redis = getRedis();
  if (redis) {
    try {
      await redis.ping();
      redisStatus = "healthy";
    } catch {
      redisStatus = "unavailable";
    }
  }

  const isHealthy = dbStatus === "healthy" && redisStatus !== "unavailable";
  const status = isHealthy ? "healthy" : "degraded";

  return NextResponse.json(
    {
      status,
      service: "reglayer",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      dependencies: {
        database: dbStatus,
        redis: redisStatus,
      },
    },
    { status: isHealthy ? 200 : 503 }
  );
}
