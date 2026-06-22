/**
 * RegLayer — Manual-test verdict readers (shared)
 *
 * WHY: Manual-test verdicts + the combined "human-verified" score are persisted on
 *      the latest manual-test AuditRequest for a site, but multiple surfaces need
 *      to READ them — VPAT/ACR, the compliance matrix, and the scan detail. This is
 *      the single source for those reads (was previously private to the VPAT route).
 */

import { prisma } from "@/lib/database/prisma";

export type ManualVerdictValue = "pass" | "fail" | "na";

export interface ManualVerdict {
  criterion: string;
  verdict: ManualVerdictValue;
  attestedBy: string | null;
}

interface PlanItem {
  criterion: string;
  verdict: string;
  attestedBy: string | null;
}
type PlanShape = { items?: PlanItem[] } | null;

/** Latest manual-test audit (any status) for a site, with its findings + scores. */
async function latestManualAudit(siteId: string) {
  return prisma.auditRequest.findFirst({
    where: { siteId, type: "manual-test" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      automatedScore: true,
      manualScore: true,
      combinedScore: true,
      completedAt: true,
      findings: true,
    },
  });
}

/**
 * The human-attested verdicts (pass/fail/na) from the latest manual test for a site.
 * Returns undefined when there's no manual testing on record — callers treat that as
 * "automated only". Shape kept compatible with the VPAT generator's manualVerdicts.
 */
export async function loadManualVerdicts(siteId: string | null): Promise<ManualVerdict[] | undefined> {
  if (!siteId) return undefined;
  const audit = await prisma.auditRequest.findFirst({
    where: { siteId, type: "manual-test" },
    orderBy: { createdAt: "desc" },
    select: { findings: true },
  });
  const plan = audit?.findings as unknown as PlanShape;
  if (!plan?.items) return undefined;
  const verdicts = plan.items
    .filter((it) => it.verdict === "pass" || it.verdict === "fail" || it.verdict === "na")
    .map((it) => ({ criterion: it.criterion, verdict: it.verdict as ManualVerdictValue, attestedBy: it.attestedBy }));
  return verdicts.length > 0 ? verdicts : undefined;
}

export interface ManualAuditSummary {
  auditId: string;
  status: string;
  automatedScore: number | null;
  manualScore: number | null;
  combinedScore: number | null;
  completedAt: string | null;
  counts: { pass: number; fail: number; na: number; untested: number; total: number };
}

/**
 * Compact summary of the latest manual test for a site — for the scan detail's
 * "Human-verified" card. Returns null when there's no manual testing on record.
 */
export async function getManualAuditSummary(siteId: string | null): Promise<ManualAuditSummary | null> {
  if (!siteId) return null;
  const audit = await latestManualAudit(siteId);
  if (!audit) return null;
  const plan = audit.findings as unknown as PlanShape;
  const items = plan?.items ?? [];
  const counts = { pass: 0, fail: 0, na: 0, untested: 0, total: items.length };
  for (const it of items) {
    if (it.verdict === "pass") counts.pass++;
    else if (it.verdict === "fail") counts.fail++;
    else if (it.verdict === "na") counts.na++;
    else counts.untested++;
  }
  return {
    auditId: audit.id,
    status: audit.status,
    automatedScore: audit.automatedScore,
    manualScore: audit.manualScore,
    combinedScore: audit.combinedScore,
    completedAt: audit.completedAt ? audit.completedAt.toISOString() : null,
    counts,
  };
}
