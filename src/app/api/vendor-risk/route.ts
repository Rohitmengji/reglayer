/**
 * GET /api/vendor-risk?scanId= — Analyze third-party vendor accessibility risk
 *
 * Also feeds the Vendor Accessibility Liability Graph: each analysis best-effort records
 * per-vendor observations for cross-tenant aggregation (see /api/vendor-graph).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { assertScanAccess } from "@/lib/auth/access";
import { analyzeVendorRisk } from "@/lib/vendor/vendorRiskScanner";
import { recordVendorObservations } from "@/lib/vendorgraph/recordObservations";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const scanId = request.nextUrl.searchParams.get("scanId");
    if (!scanId) {
      return NextResponse.json({ error: "scanId is required" }, { status: 400 });
    }

    // Ownership check — the caller must own the scan (closes a cross-tenant read).
    const access = await assertScanAccess(scanId, session);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const report = await analyzeVendorRisk(scanId);
    if (!report) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    // Feed the Vendor Liability Graph (best-effort; never blocks the response).
    await recordVendorObservations(report);

    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
