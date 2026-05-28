/**
 * RegLayer — Scan Export API
 *
 * WHY: Users need to export scan results for external tools or reporting.
 * WHAT: GET returns scan data as CSV or JSON (format query param).
 * HOW: Serializes scan violations into requested format with proper Content-Type headers.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";

/**
 * GET /api/scans/:id/export
 * 
 * Export scan violations in CSV or JSON format.
 * Query: ?format=csv|json (default: json)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;
  const format = request.nextUrl.searchParams.get("format") || "json";

  const scan = await prisma.scan.findUnique({
    where: { id },
    include: {
      violations: {
        select: {
          ruleId: true,
          impact: true,
          description: true,
          help: true,
          helpUrl: true,
          wcagCriteria: true,
          wcagLevel: true,
          tags: true,
        },
      },
    },
  });

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  if (format === "csv") {
    const headers = ["Rule ID", "Impact", "Description", "WCAG Criteria", "WCAG Level", "Help URL", "Tags"];
    const rows = scan.violations.map((v) => [
      v.ruleId,
      v.impact,
      (v.description || "").replace(/"/g, '""'),
      v.wcagCriteria || "",
      v.wcagLevel || "",
      v.helpUrl || "",
      (v.tags || []).join("; "),
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((r) => r.map((c) => `"${c}"`).join(",")),
    ].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="reglayer-${id}-violations.csv"`,
      },
    });
  }

  // JSON format
  return NextResponse.json({
    scan: {
      id: scan.id,
      url: scan.url,
      score: scan.score,
      scannedAt: scan.createdAt,
      totalViolations: scan.totalViolations,
    },
    violations: scan.violations,
  });
}
