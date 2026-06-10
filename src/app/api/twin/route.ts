/**
 * RegLayer — Digital Twin API
 *
 * POST /api/twin/compare — Compare baseline scan with proposed (PR preview) scan
 * GET /api/twin/fingerprint?scanId= — Get structural fingerprint for a scan
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { generateFingerprint, compareTwins } from "@/lib/twin/digitalTwinEngine";
import { z } from "zod";

const compareSchema = z.object({
  baselineScanId: z.string().min(1),
  proposedScanId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = compareSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { baselineScanId, proposedScanId } = parsed.data;

    const [baseline, proposed] = await Promise.all([
      generateFingerprint(baselineScanId),
      generateFingerprint(proposedScanId),
    ]);

    if (!baseline || !proposed) {
      return NextResponse.json({ error: "One or both scans not found" }, { status: 404 });
    }

    const comparison = compareTwins(baseline, proposed);
    return NextResponse.json(comparison);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

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

    const fingerprint = await generateFingerprint(scanId);
    if (!fingerprint) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    return NextResponse.json({ fingerprint });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
