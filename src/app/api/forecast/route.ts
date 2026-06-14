/**
 * GET /api/forecast?siteId=&targetScore=&deadline= — Generate compliance forecast
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { generateForecast } from "@/lib/forecasting/complianceForecast";
import { z } from "zod";

// FIX C10: validate numeric query params. An unvalidated Number(...) yields NaN
// for garbage input ("?targetScore=abc"), which then propagates into forecast
// math and can produce a 500. Coerce + bound, defaulting to 90.
const targetScoreSchema = z.coerce.number().min(0).max(100).default(90);

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const siteId = searchParams.get("siteId");
    const deadline = searchParams.get("deadline") ?? undefined;

    if (!siteId) {
      return NextResponse.json({ error: "siteId is required" }, { status: 400 });
    }

    // FIX C10: reject invalid targetScore with 400 instead of crashing on NaN.
    const parsedTargetScore = targetScoreSchema.safeParse(
      searchParams.get("targetScore") ?? undefined
    );
    if (!parsedTargetScore.success) {
      return NextResponse.json(
        { error: "Invalid targetScore — must be a number between 0 and 100" },
        { status: 400 }
      );
    }
    const targetScore = parsedTargetScore.data;

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
