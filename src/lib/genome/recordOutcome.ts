/**
 * RegLayer — Fix Genome outcome recording (server-only, best-effort)
 *
 * Records one fix-outcome row for the Fix Genome. BEST-EFFORT BY DESIGN: it never throws.
 * If the fix_outcomes table is absent (migration pending) or the write fails, it
 * swallows the error and returns false, so the caller's primary flow (fix verification)
 * is never disrupted.
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { computeFingerprint } from "@/lib/genome/fixGenome";

const DAY_MS = 86_400_000;

export interface RecordOutcomeArgs {
  workspaceId?: string | null;
  siteId?: string | null;
  violationId?: string | null;
  ruleId: string;
  selector?: string | null;
  fixCategory?: string | null;
  impact?: string | null;
  /** "re-scan" | "rum-drop" | "manual" */
  verifiedVia: string;
  success: boolean;
  detectedAt?: Date | null;
  verifiedAt: Date;
}

/** Extract the first concrete selector from a violation's affectedElements JSON. */
export function firstSelector(affectedElements: unknown): string | null {
  if (Array.isArray(affectedElements) && affectedElements.length > 0) {
    const el = affectedElements[0] as { target?: unknown };
    const t = el?.target;
    if (Array.isArray(t) && typeof t[0] === "string") return t[0];
    if (typeof t === "string") return t;
  }
  return null;
}

export async function recordFixOutcome(args: RecordOutcomeArgs): Promise<boolean> {
  try {
    const detectedAt = args.detectedAt ?? null;
    const daysToEffect = detectedAt
      ? Math.max(0, (args.verifiedAt.getTime() - detectedAt.getTime()) / DAY_MS)
      : null;

    await prisma.fixOutcomeRecord.create({
      data: {
        workspaceId: args.workspaceId ?? null,
        siteId: args.siteId ?? null,
        violationId: args.violationId ?? null,
        ruleId: args.ruleId,
        fingerprint: computeFingerprint(args.ruleId, args.selector),
        fixCategory: args.fixCategory ?? null,
        impact: args.impact ?? null,
        verifiedVia: args.verifiedVia,
        success: args.success,
        detectedAt,
        verifiedAt: args.verifiedAt,
        daysToEffect,
      },
    });
    return true;
  } catch {
    // Migration pending or transient failure — never disrupt the caller's primary flow.
    return false;
  }
}
