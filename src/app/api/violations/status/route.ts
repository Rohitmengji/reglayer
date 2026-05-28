/**
 * RegLayer — Violation Status API
 *
 * WHY: Teams need to track violation remediation progress (open, in-progress, fixed, won't-fix).
 * WHAT: PATCH updates a violation's status. Used for workflow tracking.
 * HOW: Updates violation metadata in the database. Logs status change to audit trail.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { z } from "zod";

const updateSchema = z.object({
  violationId: z.string(),
  status: z.enum(["open", "in-progress", "fixed", "ignored", "wont-fix"]),
  note: z.string().max(500).optional(),
});

/**
 * GET /api/violations/status — Get remediation statuses
 * Query: ?scanId=xxx or ?ruleId=xxx
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const scanId = request.nextUrl.searchParams.get("scanId");
  const ruleId = request.nextUrl.searchParams.get("ruleId");

  const where: Record<string, unknown> = { action: "violation.status_updated" };
  if (scanId) where.target = scanId;

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  // Build a map of latest status per violation
  const statusMap = new Map<string, { status: string; note?: string; updatedAt: Date }>();
  for (const log of logs) {
    const meta = log.metadata as Record<string, unknown>;
    const vid = meta.violationId as string;
    if (ruleId && meta.ruleId !== ruleId) continue;
    if (!statusMap.has(vid)) {
      statusMap.set(vid, {
        status: meta.status as string,
        note: meta.note as string | undefined,
        updatedAt: log.createdAt,
      });
    }
  }

  return NextResponse.json({
    statuses: Object.fromEntries(statusMap),
  });
}

/**
 * POST /api/violations/status — Update a violation's remediation status
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { violationId, status, note } = parsed.data;

  // Get violation info for context
  const violation = await prisma.violation.findUnique({
    where: { id: violationId },
    select: { ruleId: true, scanId: true, impact: true },
  });

  if (!violation) {
    return NextResponse.json({ error: "Violation not found" }, { status: 404 });
  }

  await prisma.auditLog.create({
    data: {
      action: "violation.status_updated",
      target: violation.scanId,
      metadata: {
        violationId,
        ruleId: violation.ruleId,
        impact: violation.impact,
        status,
        note,
      },
    },
  });

  return NextResponse.json({ violationId, status, note });
}
