/**
 * RegLayer — Site Risk Trend API
 *
 * GET: Returns risk score trend over time
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { assertSiteAccess } from "@/lib/auth/access";
import { getRiskTrend } from "@/lib/risk/legalRiskEngine";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { siteId } = await params;

    // IDOR guard: only members of the site's workspace may read its risk trend.
    const access = await assertSiteAccess(siteId, session);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { searchParams } = new URL(request.url);

    const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined;
    const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : undefined;

    const trend = await getRiskTrend(siteId, { from, to });

    return NextResponse.json({ trend });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
