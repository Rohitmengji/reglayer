/**
 * RegLayer — Single Scan API
 *
 * WHY: Frontend needs to fetch a single scan's full details (violations, metadata, score).
 * WHAT: GET returns complete scan data with all violations for a given scan ID.
 * HOW: Queries Prisma for scan + nested violations by ID. Verifies workspace ownership.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { mapPrismaScanToResult } from "@/lib/scanner/scanResultMapper";
import { evaluateCompliance } from "@/lib/compliance/policyEvaluator";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Find user's workspace for ownership check
    const member = await prisma.workspaceMember.findFirst({
      where: { user: { email: session.user.email } },
    });

    const scan = await prisma.scan.findUnique({
      where: { id },
      include: { violations: true },
    });

    if (!scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    // Ownership check: scan must belong to user's workspace or user directly
    const isMasterAdmin = session.user?.isMasterAdmin;
    if (!isMasterAdmin && scan.userId !== member?.userId && scan.workspaceId !== member?.workspaceId) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    // Return the rich ScanResult shape (not the raw Prisma row) + compliance, so
    // the detail/report views render correctly instead of crashing on a null
    // compliance / missing summary/timestamp/metadata fields.
    const scanResult = mapPrismaScanToResult(scan);
    const compliance = evaluateCompliance(scanResult.id, scanResult.violations);
    return NextResponse.json({ scan: scanResult, compliance });
  } catch {
    return NextResponse.json({ error: "Failed to load scan" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const role = session.user?.role;
  const isMasterAdmin = session.user?.isMasterAdmin;

  if (role !== "admin" && !isMasterAdmin) {
    return NextResponse.json(
      { error: "Forbidden: only admins can delete scans" },
      { status: 403 }
    );
  }

  const { id } = await params;

  // Verify scan belongs to user's workspace
  const member = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
  });

  const scan = await prisma.scan.findUnique({ where: { id } });
  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  if (!isMasterAdmin && scan.workspaceId !== member?.workspaceId) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  // Delete violations first, then the scan
  await prisma.violation.deleteMany({ where: { scanId: id } });
  await prisma.scan.delete({ where: { id } });

  return NextResponse.json({ deleted: true, id });
}
