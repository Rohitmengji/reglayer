/**
 * ---------------------------------------------------------
 * RegLayer — Litigation Defense File data loader (server-only)
 * ---------------------------------------------------------
 *
 * WHY: The defense-file assembly core (defenseFile.ts) is pure and Prisma-free so it
 *      stays exhaustively testable. This thin loader is the ONLY place that touches
 *      the database for the feature; it adapts Prisma rows into the pure input shape.
 *
 * SECURITY: This loader assumes the caller has ALREADY verified access to `siteId`
 *      via assertSiteAccess and passes the resolved `workspaceId`. It scopes reads as:
 *       - scans:   by siteId only — the Site is the tenant boundary (matching the
 *                  established trends precedent). Scan.workspaceId is nullable, so
 *                  filtering scans by workspaceId would WRONGLY drop legacy scans that
 *                  belong to a workspaced site but have a null workspaceId.
 *       - audit:   by target ∈ violationIds only. The two writers of these audit rows
 *                  (the violation status + verify routes) persist them with NO
 *                  workspaceId (null), so adding a workspaceId filter would silently
 *                  return zero rows. violationIds are already tenant-scoped because
 *                  they come from this site's access-checked scans.
 *       - proofs:  by workspaceId + siteId. ComplianceProof rows DO carry a non-null
 *                  workspaceId (issueProof sets it), and the chain is per-workspace.
 * ---------------------------------------------------------
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { verifyWorkspaceChain } from "@/lib/vault/proofEngine";
import type {
  DefenseFileInput,
  DefenseScanInput,
  DefenseViolationInput,
  DefenseAuditInput,
  DefenseProofInput,
} from "@/lib/defense/defenseFile";

/** Empty chain report — byte-identical to what verifyChain returns for a 0-length chain. */
const EMPTY_CHAIN_REPORT = { valid: true, length: 0, brokenAt: null, issues: [] } as const;

export async function loadDefenseFileData(args: {
  site: { id: string; url: string; name: string | null; workspaceId: string | null };
  generatedAt: Date;
}): Promise<DefenseFileInput> {
  const { site, generatedAt } = args;

  // Scans + their violations, oldest first. Scoped by siteId (the tenant boundary).
  const scanRows = await prisma.scan.findMany({
    where: { siteId: site.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      score: true,
      totalViolations: true,
      critical: true,
      serious: true,
      moderate: true,
      minor: true,
      compliance: true,
      pageTitle: true,
      url: true,
      createdAt: true,
      completedAt: true,
      startedAt: true,
      duration: true,
      errorMessage: true,
      violations: {
        select: {
          id: true,
          scanId: true,
          ruleId: true,
          impact: true,
          wcagCriteria: true,
          wcagLevel: true,
          status: true,
          statusNote: true,
          statusUpdatedAt: true,
          statusUpdatedBy: true,
          verifiedAt: true,
        },
      },
    },
  });

  const scans: DefenseScanInput[] = scanRows.map((s) => ({
    id: s.id,
    status: s.status,
    score: s.score,
    totalViolations: s.totalViolations,
    critical: s.critical,
    serious: s.serious,
    moderate: s.moderate,
    minor: s.minor,
    compliance: s.compliance,
    pageTitle: s.pageTitle,
    url: s.url,
    createdAt: s.createdAt,
    completedAt: s.completedAt,
    startedAt: s.startedAt,
    duration: s.duration,
    errorMessage: s.errorMessage,
  }));

  const violations: DefenseViolationInput[] = scanRows.flatMap((s) =>
    s.violations.map((v) => ({
      id: v.id,
      scanId: v.scanId,
      ruleId: v.ruleId,
      impact: v.impact,
      wcagCriteria: v.wcagCriteria,
      wcagLevel: v.wcagLevel,
      status: v.status,
      statusNote: v.statusNote,
      statusUpdatedAt: v.statusUpdatedAt,
      statusUpdatedBy: v.statusUpdatedBy,
      verifiedAt: v.verifiedAt,
    }))
  );

  // Status-transition + verification history from the generic audit log. Scoped by
  // target ∈ violationIds ONLY (these rows carry no workspaceId).
  const violationIds = violations.map((v) => v.id);
  const auditRows = violationIds.length
    ? await prisma.auditLog.findMany({
        where: {
          target: { in: violationIds },
          action: { in: ["violation.status_updated", "violation.verified"] },
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          action: true,
          actor: true,
          target: true,
          metadata: true,
          createdAt: true,
        },
      })
    : [];

  const auditLogs: DefenseAuditInput[] = auditRows.map((a) => ({
    id: a.id,
    action: a.action,
    actor: a.actor,
    target: a.target,
    metadata: a.metadata,
    createdAt: a.createdAt,
  }));

  // Compliance proofs for this site, in canonical chain order. Only when the site is
  // workspace-scoped (legacy workspace-less sites have no chain).
  let proofs: DefenseProofInput[] = [];
  let chainReport: DefenseFileInput["chainReport"] = { ...EMPTY_CHAIN_REPORT, issues: [] };

  if (site.workspaceId) {
    const proofRows = await prisma.complianceProof.findMany({
      where: { workspaceId: site.workspaceId, siteId: site.id },
      orderBy: { chainIndex: "asc" },
      select: {
        id: true,
        type: true,
        title: true,
        standard: true,
        score: true,
        evidence: true,
        prevHash: true,
        chainIndex: true,
        issuedAt: true,
        expiresAt: true,
        revokedAt: true,
        revokedReason: true,
        hash: true,
        siteId: true,
      },
    });

    proofs = proofRows.map((p) => ({
      id: p.id,
      type: p.type,
      title: p.title,
      standard: p.standard,
      score: p.score,
      evidence: p.evidence,
      prevHash: p.prevHash,
      chainIndex: p.chainIndex,
      issuedAt: p.issuedAt,
      expiresAt: p.expiresAt,
      revokedAt: p.revokedAt,
      revokedReason: p.revokedReason,
      hash: p.hash,
      siteId: p.siteId,
    }));

    // The integrity statement covers the WHOLE workspace chain (tamper-evidence is a
    // chain-wide property, not per-site).
    chainReport = await verifyWorkspaceChain(site.workspaceId);
  }

  // Manual test attestations for this site (from manual-test AuditRequests)
  let manualTestAttestations: Array<{
    criterion: string;
    verdict: string;
    attestedBy: string | null;
    attestedAt: string | null;
    auditRequestId: string;
  }> = [];

  if (site.workspaceId) {
    const manualAudits = await prisma.auditRequest.findMany({
      where: {
        workspaceId: site.workspaceId,
        siteId: site.id,
        type: "manual-test",
        status: { in: ["in-progress", "completed"] },
      },
      orderBy: { createdAt: "desc" },
      take: 1, // Latest manual test only
      select: { id: true, findings: true },
    });

    if (manualAudits.length > 0) {
      const findings = manualAudits[0].findings as { items?: Array<{ criterion: string; verdict: string; attestedBy: string | null; attestedAt: string | null }> } | null;
      if (findings?.items) {
        manualTestAttestations = findings.items
          .filter((item) => item.verdict !== "untested")
          .map((item) => ({
            criterion: item.criterion,
            verdict: item.verdict,
            attestedBy: item.attestedBy,
            attestedAt: item.attestedAt,
            auditRequestId: manualAudits[0].id,
          }));
      }
    }
  }

  return { site, generatedAt, scans, violations, auditLogs, proofs, chainReport, manualTestAttestations };
}
