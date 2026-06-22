/**
 * GET /api/remediation/plan?scanId= — Generate smart remediation plan for a scan
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { assertScanAccess } from "@/lib/auth/access";
import { generateRemediationPlan } from "@/lib/remediation/smartPipeline";
import { requireFeature } from "@/lib/features/require-feature";

export async function GET(request: NextRequest) {
  try {
    const guard = await requireFeature("automation");
    if (!guard.allowed) return guard.response;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const scanId = request.nextUrl.searchParams.get("scanId");
    if (!scanId) {
      return NextResponse.json({ error: "scanId is required" }, { status: 400 });
    }

    // IDOR guard: only the scan's owner/workspace may generate its remediation plan.
    const access = await assertScanAccess(scanId, session);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const plan = await generateRemediationPlan(scanId);
    if (!plan) {
      return NextResponse.json({ error: "Scan not found or has no violations" }, { status: 404 });
    }

    return NextResponse.json(plan);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
