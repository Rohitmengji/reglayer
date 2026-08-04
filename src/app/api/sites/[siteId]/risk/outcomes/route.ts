/**
 * RegLayer — Site Litigation Outcomes API
 *
 * POST: log a real legal outcome for a site, snapshotting the latest risk prediction
 *       so the {predicted ↔ actual} pair can later calibrate the risk engine.
 * GET:  list a site's recorded outcomes.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { assertSiteAccess } from "@/lib/auth/access";
import { recordLitigationOutcome, listLitigationOutcomes } from "@/lib/risk/litigationOutcome";
import { z } from "zod";

const outcomeSchema = z.object({
  outcomeType: z.enum(["DEMAND_LETTER", "LAWSUIT_FILED", "SETTLED", "DISMISSED", "NO_ACTION"]),
  amountUsd: z.number().nonnegative().max(1e12).optional(),
  occurredAt: z.string().datetime(),
  notes: z.string().max(2000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { siteId } = await params;
    const access = await assertSiteAccess(siteId, session);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const parsed = outcomeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Snapshot the most recent prediction for this site so calibration doesn't depend
    // on re-deriving a historical score (which drifts as weights are retrained).
    let predictedTier: string | null = null;
    let predictedExposure: number | null = null;
    let scanId: string | null = null;
    try {
      const latest = await prisma.litigationRiskScore.findFirst({
        where: { siteId },
        orderBy: { calculatedAt: "desc" },
        select: { tier: true, estimatedExposure: true, scanId: true },
      });
      if (latest) {
        predictedTier = latest.tier;
        predictedExposure = latest.estimatedExposure;
        scanId = latest.scanId;
      }
    } catch {
      // No prediction yet — the outcome is still worth capturing.
    }

    const ok = await recordLitigationOutcome({
      workspaceId: access.workspaceId,
      siteId,
      scanId,
      outcomeType: parsed.data.outcomeType,
      amountUsd: parsed.data.amountUsd ?? null,
      occurredAt: new Date(parsed.data.occurredAt),
      source: "manual",
      notes: parsed.data.notes ?? null,
      predictedTier,
      predictedExposure,
    });

    if (!ok) {
      return NextResponse.json(
        { error: "Litigation outcome storage is not yet provisioned (migration pending)." },
        { status: 503 },
      );
    }

    return NextResponse.json({ recorded: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { siteId } = await params;
    const access = await assertSiteAccess(siteId, session);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const outcomes = await listLitigationOutcomes(siteId);
    return NextResponse.json({ outcomes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
