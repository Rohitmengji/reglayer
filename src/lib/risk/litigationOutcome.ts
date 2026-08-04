/**
 * RegLayer — Litigation Outcome recorder (ground-truth capture)
 *
 * WHY: The risk engine PREDICTS exposure; this captures what ACTUALLY happened
 *      (demand letter, suit, settlement, dismissal) paired with that prediction.
 *      That {predicted ↔ actual} dataset is the only thing that can calibrate — and
 *      eventually train — a real litigation oracle, and it cannot be back-dated.
 * HOW: Best-effort writes. If the litigation_outcomes table is not yet provisioned,
 *      the recorder no-ops rather than failing the caller — mirroring the Fix Genome
 *      and Vendor Graph recorders.
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import type { LitigationOutcomeType } from "@/generated/prisma/client";

export interface RecordLitigationOutcomeArgs {
  workspaceId?: string | null;
  siteId?: string | null;
  scanId?: string | null;
  outcomeType: LitigationOutcomeType;
  amountUsd?: number | null;
  occurredAt: Date;
  source?: string;
  notes?: string | null;
  predictedTier?: string | null;
  predictedExposure?: number | null;
}

/** Persist a legal outcome. Returns false (never throws) if storage is absent. */
export async function recordLitigationOutcome(
  args: RecordLitigationOutcomeArgs,
): Promise<boolean> {
  try {
    await prisma.litigationOutcome.create({
      data: {
        workspaceId: args.workspaceId ?? null,
        siteId: args.siteId ?? null,
        scanId: args.scanId ?? null,
        outcomeType: args.outcomeType,
        amountUsd: args.amountUsd ?? null,
        occurredAt: args.occurredAt,
        source: args.source ?? "manual",
        notes: args.notes ?? null,
        predictedTier: args.predictedTier ?? null,
        predictedExposure: args.predictedExposure ?? null,
      },
    });
    return true;
  } catch {
    return false; // litigation_outcomes not yet provisioned — degrade gracefully
  }
}

export interface LitigationOutcomeRow {
  id: string;
  outcomeType: LitigationOutcomeType;
  amountUsd: number | null;
  occurredAt: string;
  source: string;
  notes: string | null;
  predictedTier: string | null;
  predictedExposure: number | null;
}

/** List a site's recorded outcomes (most recent first). Empty if storage is absent. */
export async function listLitigationOutcomes(siteId: string): Promise<LitigationOutcomeRow[]> {
  try {
    const rows = await prisma.litigationOutcome.findMany({
      where: { siteId },
      orderBy: { occurredAt: "desc" },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      outcomeType: r.outcomeType,
      amountUsd: r.amountUsd,
      occurredAt: r.occurredAt.toISOString(),
      source: r.source,
      notes: r.notes,
      predictedTier: r.predictedTier,
      predictedExposure: r.predictedExposure,
    }));
  } catch {
    return [];
  }
}
