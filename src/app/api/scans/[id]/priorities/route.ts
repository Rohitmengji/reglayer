/**
 * RegLayer — Scan Priorities API
 *
 * WHY: Users need to know which violations to fix first for maximum score improvement.
 * WHAT: GET returns prioritized fix list ranked by impact × effort × recurrence.
 * HOW: Calls priorityEngine with scan violations, returns ranked fixes with time estimates.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { assertScanAccess } from "@/lib/auth/access";
import { prisma } from "@/lib/database/prisma";
import { consumeCredits } from "@/lib/credits";
import { generatePriorityReport } from "@/lib/intelligence/priorityEngine";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Auth & credit check
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // IDOR guard: only the scan's owner/workspace may rank its priorities (and spend credits).
  const access = await assertScanAccess(id, session);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  // Verify scan exists before consuming credits. Capture tenant identifiers so
  // recurrence aggregates stay scoped to this scan's workspace/owner.
  const scan = await prisma.scan.findUnique({
    where: { id },
    select: { id: true, workspaceId: true, userId: true },
  });
  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const creditResult = await consumeCredits(user.id, "priorityRanking");
  if (!creditResult.success) {
    return NextResponse.json(
      { error: "Insufficient AI credits", creditsRemaining: creditResult.creditsRemaining, cost: creditResult.cost, upgradeRequired: true },
      { status: 429 }
    );
  }

  try {
    const report = await generatePriorityReport(id, {
      workspaceId: scan.workspaceId,
      userId: scan.userId,
    });
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
