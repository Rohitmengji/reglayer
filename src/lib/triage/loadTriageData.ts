/**
 * RegLayer — Demand-Letter Triage data loader (server-only)
 *
 * WHY: Keep the pure triage core (demandLetter.ts) free of Prisma and the server-only
 *      legalRiskEngine. This adapter loads the site's history + builds the dollar model.
 *
 * SECURITY: assumes the caller has already verified access to siteId via assertSiteAccess
 *      and passes the resolved workspaceId. Scans are scoped by siteId (the tenant
 *      boundary, matching the trends/defense-file precedent). Proofs are read via
 *      listProofs, which selects only pre-existing columns — so this works WITHOUT the
 *      pending proof-chain migration.
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { listProofs } from "@/lib/vault/proofEngine";
import {
  LITIGATION_WEIGHTS,
  INDUSTRY_MULTIPLIERS,
  GEO_MULTIPLIERS,
} from "@/lib/risk/legalRiskEngine";
import type {
  TriageInput,
  DemandClaim,
  TriageScanInput,
  TriageViolationInput,
  TriageProofInput,
  ExposureModel,
} from "@/lib/triage/demandLetter";

/** legalRiskEngine applies a 0.15 settlement-probability factor to avg settlements. */
const SETTLEMENT_PROBABILITY = 0.15;

export function buildExposureModel(industry: string, primaryGeo: string): ExposureModel {
  const settlements: Record<string, number> = {};
  for (const [ruleId, data] of Object.entries(LITIGATION_WEIGHTS)) {
    settlements[ruleId] = data.avgSettlement;
  }
  return {
    settlements,
    industryMultiplier: INDUSTRY_MULTIPLIERS[industry] ?? INDUSTRY_MULTIPLIERS.other,
    geoMultiplier: GEO_MULTIPLIERS[primaryGeo] ?? GEO_MULTIPLIERS.other,
    settlementProbability: SETTLEMENT_PROBABILITY,
    industry,
    primaryGeo,
  };
}

export async function loadTriageData(args: {
  site: { id: string; url: string; name: string | null; workspaceId: string | null };
  context: { industry: string; primaryGeo: string };
  claims: DemandClaim[];
  generatedAt: Date;
}): Promise<TriageInput> {
  const { site, context, claims, generatedAt } = args;

  const scanRows = await prisma.scan.findMany({
    where: { siteId: site.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      createdAt: true,
      completedAt: true,
      violations: {
        select: {
          scanId: true,
          ruleId: true,
          impact: true,
          status: true,
          verifiedAt: true,
          statusUpdatedAt: true,
        },
      },
    },
  });

  const scans: TriageScanInput[] = scanRows.map((s) => ({
    id: s.id,
    status: s.status,
    createdAt: s.createdAt,
    completedAt: s.completedAt,
  }));

  const violations: TriageViolationInput[] = scanRows.flatMap((s) =>
    s.violations.map((v) => ({
      scanId: v.scanId,
      ruleId: v.ruleId,
      impact: v.impact,
      status: v.status,
      verifiedAt: v.verifiedAt,
      statusUpdatedAt: v.statusUpdatedAt,
    }))
  );

  // Proofs via listProofs — migration-safe (selects only pre-existing columns).
  let proofs: TriageProofInput[] = [];
  if (site.workspaceId) {
    const { proofs: rows } = await listProofs(site.workspaceId, { siteId: site.id, limit: 200 });
    proofs = rows.map((p) => ({
      id: p.id,
      type: p.type,
      standard: p.standard,
      issuedAt: p.issuedAt,
      revokedAt: p.revokedAt,
    }));
  }

  return {
    site: { id: site.id, url: site.url, name: site.name },
    generatedAt,
    exposure: buildExposureModel(context.industry, context.primaryGeo),
    claims,
    scans,
    violations,
    proofs,
  };
}
