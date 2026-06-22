/**
 * RegLayer — Manual-test summary for a scan
 *
 * WHY: The scan detail view shows a "Human-verified" card so manual testing
 *      visibly contributes to what the user sees. This is a lightweight read
 *      (just siteId → latest manual audit summary), fetched independently of the
 *      heavier scan payload so it works whether the detail came from cache or API.
 * WHAT: GET → { manualSummary } (null when there's no manual testing on record).
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { assertScanAccess } from "@/lib/auth/access";
import { prisma } from "@/lib/database/prisma";
import { getManualAuditSummary } from "@/lib/testing/manualVerdicts";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;

  // IDOR guard: only the scan's owner/workspace may read its manual summary.
  const access = await assertScanAccess(id, session);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const scan = await prisma.scan.findUnique({ where: { id }, select: { siteId: true } });
  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const manualSummary = await getManualAuditSummary(scan.siteId);
  return NextResponse.json({ manualSummary });
}
