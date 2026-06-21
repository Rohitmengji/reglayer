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
import { requireWorkspacePermission } from "@/lib/auth/api-guard";

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

  const { id } = await params;

  // Resolve the caller's primary membership and the target scan together.
  const [member, scan] = await Promise.all([
    prisma.workspaceMember.findFirst({
      where: { user: { email: session.user.email } },
      select: { userId: true, workspaceId: true },
    }),
    prisma.scan.findUnique({ where: { id }, select: { id: true, workspaceId: true, userId: true } }),
  ]);

  const isMasterAdmin = !!session.user?.isMasterAdmin;

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  // Non-disclosure: a scan outside the caller's workspace is reported as 404,
  // never 403 — never confirm a resource exists to someone who can't see it.
  const ownsScan =
    isMasterAdmin || scan.workspaceId === member?.workspaceId || scan.userId === member?.userId;
  if (!ownsScan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  // Permission: deletion is OWNER/ADMIN (or master) only — a MEMBER who can run
  // scans still cannot delete them, and a VIEWER certainly cannot.
  const guard = await requireWorkspacePermission("scans.delete", {
    workspaceId: scan.workspaceId ?? undefined,
  });
  if (!guard.ok) return guard.response;

  // Delete violations first, then the scan
  await prisma.violation.deleteMany({ where: { scanId: id } });
  await prisma.scan.delete({ where: { id } });

  return NextResponse.json({ deleted: true, id });
}
