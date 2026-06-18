/**
 * RegLayer — Fix Flow API
 *
 * WHY: The gap between "I scanned" and "I fixed" is where 90% of users drop off.
 *      This endpoint returns prioritized, actionable fix cards — one at a time.
 *
 * WHAT:
 *   GET /api/fix-flow/[scanId] — Get ordered fix cards for a scan
 *   GET /api/fix-flow/[scanId]?limit=5 — Limit number of cards returned
 *   GET /api/fix-flow/[scanId]?offset=0 — Pagination offset
 *
 * HOW: Fetches scan violations from DB, runs through fix-prioritizer engine,
 *      returns ordered fix cards with code snippets and point estimates.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { assertScanAccess } from "@/lib/auth/access";
import { prisma } from "@/lib/database/prisma";
import { generateFixCards } from "@/lib/intelligence/fix-prioritizer";
import type { AccessibilityViolation } from "@/lib/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const { scanId } = await params;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0"), 0);

  if (!scanId) {
    return NextResponse.json({ error: "scanId is required" }, { status: 400 });
  }

  // IDOR guard: only the scan's owner/workspace may read its fix cards.
  const session = await getServerSession(authOptions);
  const access = await assertScanAccess(scanId, session);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    include: { violations: true },
  });

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  if (scan.status !== "COMPLETED") {
    return NextResponse.json({ error: "Scan not yet completed" }, { status: 422 });
  }

  // Map DB violations to domain type
  const violations: AccessibilityViolation[] = scan.violations.map((v) => ({
    id: v.ruleId,
    impact: v.impact as AccessibilityViolation["impact"],
    description: v.description,
    help: v.help ?? v.description,
    helpUrl: v.helpUrl ?? "",
    wcagTags: v.tags ?? [],
    nodes: (v.affectedElements as Array<{ html: string; target: string[]; failureSummary: string }>) ?? [],
  }));

  // Generate fix cards
  const allCards = generateFixCards(violations);
  const paginatedCards = allCards.slice(offset, offset + limit);

  return NextResponse.json({
    scanId,
    url: scan.url,
    totalCards: allCards.length,
    offset,
    limit,
    cards: paginatedCards,
  });
}
