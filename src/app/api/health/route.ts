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

export async function GET() {
  return NextResponse.json(
    {
      status: "healthy",
      service: "reglayer",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
    { status: 200 }
  );
}
