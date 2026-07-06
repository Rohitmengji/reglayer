/**
 * ---------------------------------------------------------
 * RegLayer — Impact Certificate Loader (server-only)
 * ---------------------------------------------------------
 *
 * Aggregates data from scans, evidence chain, litigation risk, and agent runs
 * to feed the pure impact calculator. Persists generated certificates.
 * ---------------------------------------------------------
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { calculateImpact, type ImpactInput, type ImpactResult } from "./calculator";
import { nanoid } from "@/lib/utils/nanoid";

export interface GenerateCertificateInput {
  workspaceId: string;
  siteId: string;
  periodStart: Date;
  periodEnd: Date;
  monthlyTraffic?: number;
  conversionRate?: number;
  avgOrderValue?: number;  // USD cents
  industry?: string;
  isPublic?: boolean;
}

export interface CertificateResult {
  id: string;
  impact: ImpactResult;
  publicUrl: string | null;
}

/**
 * Generate an Impact Certificate for a site over a given period.
 * Aggregates all available data sources and computes ROI metrics.
 */
export async function generateImpactCertificate(
  input: GenerateCertificateInput
): Promise<CertificateResult> {
  const { workspaceId, siteId, periodStart, periodEnd } = input;

  // ── Gather before-state (first scan in period) ──
  const firstScan = await prisma.scan.findFirst({
    where: { workspaceId, siteId, status: "COMPLETED", createdAt: { gte: periodStart, lte: periodEnd } },
    orderBy: { createdAt: "asc" },
    select: { score: true, totalViolations: true, createdAt: true },
  });

  // ── Gather after-state (latest scan in period) ──
  const lastScan = await prisma.scan.findFirst({
    where: { workspaceId, siteId, status: "COMPLETED", createdAt: { gte: periodStart, lte: periodEnd } },
    orderBy: { createdAt: "desc" },
    select: { score: true, totalViolations: true, createdAt: true },
  });

  if (!firstScan || !lastScan) {
    throw new Error("Insufficient scan data in the specified period");
  }

  // ── Count scans in period ──
  const scansInPeriod = await prisma.scan.count({
    where: { workspaceId, siteId, status: "COMPLETED", createdAt: { gte: periodStart, lte: periodEnd } },
  });

  // ── Evidence chain proofs in period ──
  const proofChainLength = await prisma.complianceProof.count({
    where: { workspaceId, siteId, issuedAt: { gte: periodStart, lte: periodEnd } },
  });

  // ── Monitoring days (approximate from scan span) ──
  const monitoringDays = Math.max(1, Math.round(
    (lastScan.createdAt.getTime() - firstScan.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  ));

  // ── Litigation risk (before and after) ──
  const riskBefore = await prisma.litigationRiskScore.findFirst({
    where: { siteId, calculatedAt: { gte: periodStart, lte: new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000) } },
    orderBy: { calculatedAt: "asc" },
    select: { estimatedExposure: true },
  });
  const riskAfter = await prisma.litigationRiskScore.findFirst({
    where: { siteId, calculatedAt: { gte: new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000), lte: periodEnd } },
    orderBy: { calculatedAt: "desc" },
    select: { estimatedExposure: true },
  });

  // ── Agent persona results (if available) ──
  const agentRunsBefore = await prisma.agentRun.findMany({
    where: { workspaceId, siteId, createdAt: { gte: periodStart, lte: new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000) } },
    select: { persona: true, goalAchieved: true },
  });
  const agentRunsAfter = await prisma.agentRun.findMany({
    where: { workspaceId, siteId, createdAt: { gte: new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000), lte: periodEnd } },
    select: { persona: true, goalAchieved: true },
  });

  const personasBefore = new Set(agentRunsBefore.filter((r) => r.goalAchieved).map((r) => r.persona)).size;
  const personasAfter = new Set(agentRunsAfter.filter((r) => r.goalAchieved).map((r) => r.persona)).size;

  // ── Build impact input ──
  const impactInput: ImpactInput = {
    scoreBefore: firstScan.score ?? 0,
    violationsBefore: firstScan.totalViolations ?? 0,
    riskExposureBefore: Math.round((riskBefore?.estimatedExposure ?? 0) * 100),
    personasPassingBefore: personasBefore,
    scoreAfter: lastScan.score ?? 0,
    violationsAfter: lastScan.totalViolations ?? 0,
    riskExposureAfter: Math.round((riskAfter?.estimatedExposure ?? 0) * 100),
    personasPassingAfter: personasAfter,
    monthlyTraffic: input.monthlyTraffic ?? estimateTraffic(input.industry),
    disabilityPrevalence: 0.15,
    conversionRate: input.conversionRate ?? null,
    avgOrderValue: input.avgOrderValue ?? null,
    industry: input.industry ?? null,
    proofChainLength,
    monitoringDays,
    scansInPeriod,
    periodStart,
    periodEnd,
  };

  // ── Calculate impact ──
  const impact = calculateImpact(impactInput);

  // ── Persist certificate ──
  const publicSlug = input.isPublic ? nanoid(12) : null;

  const cert = await prisma.impactCertificate.create({
    data: {
      workspaceId,
      siteId,
      periodStart,
      periodEnd,
      scoreBefore: impactInput.scoreBefore,
      violationsBefore: impactInput.violationsBefore,
      riskExposureBefore: impactInput.riskExposureBefore,
      personasPassingBefore: impactInput.personasPassingBefore,
      scoreAfter: impactInput.scoreAfter,
      violationsAfter: impactInput.violationsAfter,
      riskExposureAfter: impactInput.riskExposureAfter,
      personasPassingAfter: impactInput.personasPassingAfter,
      usersUnblocked: impact.usersUnblocked,
      revenueEnabled: impact.revenueEnabled,
      riskReduced: impact.riskReduced,
      violationsFixed: impact.violationsFixed,
      scoreImprovement: impact.scoreImprovement,
      industryPercentile: impact.industryPercentile,
      proofChainLength,
      monitoringDays,
      scansInPeriod,
      evidenceHash: impact.evidenceHash,
      trafficEstimate: input.monthlyTraffic,
      disabilityPrevalence: 0.15,
      avgConversionRate: input.conversionRate,
      avgOrderValue: input.avgOrderValue,
      industry: input.industry,
      isPublic: input.isPublic ?? false,
      publicSlug,
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://reglayer.vercel.app";

  return {
    id: cert.id,
    impact,
    publicUrl: publicSlug ? `${appUrl}/impact/${publicSlug}` : null,
  };
}

/**
 * Verify an impact certificate's hash is valid (not tampered).
 */
export async function verifyImpactCertificate(certId: string): Promise<{
  valid: boolean;
  certificate: unknown;
} | null> {
  const cert = await prisma.impactCertificate.findUnique({ where: { id: certId } });
  if (!cert) return null;

  // Recompute the hash from stored data
  const impactInput: ImpactInput = {
    scoreBefore: cert.scoreBefore,
    violationsBefore: cert.violationsBefore,
    riskExposureBefore: cert.riskExposureBefore,
    personasPassingBefore: cert.personasPassingBefore,
    scoreAfter: cert.scoreAfter,
    violationsAfter: cert.violationsAfter,
    riskExposureAfter: cert.riskExposureAfter,
    personasPassingAfter: cert.personasPassingAfter,
    monthlyTraffic: cert.trafficEstimate ?? 0,
    disabilityPrevalence: cert.disabilityPrevalence,
    conversionRate: cert.avgConversionRate,
    avgOrderValue: cert.avgOrderValue,
    industry: cert.industry,
    proofChainLength: cert.proofChainLength,
    monitoringDays: cert.monitoringDays,
    scansInPeriod: cert.scansInPeriod,
    periodStart: cert.periodStart,
    periodEnd: cert.periodEnd,
  };

  const recomputed = calculateImpact(impactInput);
  const valid = recomputed.evidenceHash === cert.evidenceHash;

  return { valid, certificate: cert };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function estimateTraffic(industry: string | undefined): number {
  // Conservative default estimates by industry
  const estimates: Record<string, number> = {
    ecommerce: 50000,
    saas: 20000,
    fintech: 30000,
    healthcare: 25000,
    education: 40000,
    media: 100000,
    government: 60000,
    nonprofit: 15000,
  };
  return estimates[industry ?? ""] ?? 25000;
}
