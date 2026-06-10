/**
 * GET /api/forecast?siteId=&targetScore=&deadline= — Generate compliance forecast
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { generateForecast } from "@/lib/forecasting/complianceForecast";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const siteId = searchParams.get("siteId");
    const targetScore = Number(searchParams.get("targetScore") ?? "90");
    const deadline = searchParams.get("deadline") ?? undefined;

    if (!siteId) {
      return NextResponse.json({ error: "siteId is required" }, { status: 400 });
    }

    const forecast = await generateForecast(siteId, targetScore, deadline);
    if (!forecast) {
      return NextResponse.json(
        { error: "Insufficient data — need at least 2 completed scans for forecasting" },
        { status: 404 }
      );
    }

    return NextResponse.json(forecast);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
