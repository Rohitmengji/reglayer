/**
 * GET /api/regulations — Get applicable regulations and deadlines
 *
 * Query params: geos (comma-separated), industry
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import {
  getApplicableDeadlines,
  getApplicableRegulations,
} from "@/lib/regulations/deadlineEngine";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const geosParam = searchParams.get("geos") ?? "GLOBAL";
    const industry = searchParams.get("industry") ?? undefined;

    const geos = geosParam.split(",").map((g) => g.trim().toUpperCase());

    const deadlines = getApplicableDeadlines(geos, industry);
    const regulations = getApplicableRegulations(geos, industry);

    return NextResponse.json({
      deadlines,
      regulations,
      summary: {
        total: deadlines.length,
        overdue: deadlines.filter((d) => d.urgency === "overdue").length,
        imminent: deadlines.filter((d) => d.urgency === "imminent").length,
        soon: deadlines.filter((d) => d.urgency === "soon").length,
        upcoming: deadlines.filter((d) => d.urgency === "upcoming").length,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
