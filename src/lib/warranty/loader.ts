/**
 * ---------------------------------------------------------
 * RegLayer — Warranty Loader (server-only data layer)
 * ---------------------------------------------------------
 *
 * Thin server-only module: fetches warranty-relevant data from Prisma and
 * passes it to the pure eligibility/pricing cores. Route handlers call this
 * instead of touching the DB directly.
 * ---------------------------------------------------------
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { verifyChain } from "@/lib/vault/chain";
import {
  evaluateEligibility,
  evaluateClaimEligibility,
  type PolicyConfig,
  type ScanHistoryEntry,
  type EligibilityVerdict,
  type ClaimVerdict,
} from "./eligibility";
import { calculateWarrantyPremium, type PricingResult } from "./pricing";

// ─── Get Policy with Eligibility Check ───────────────────────────────────────

export interface WarrantyStatusResult {
  policy: {
    id: string;
    tier: string;
    status: string;
    coverageLimit: number;
    scoreFloor: number;
    monthlyPremium: number;
    enrolledAt: Date;
    activatedAt: Date | null;
    expiresAt: Date | null;
    siteId: string;
    workspaceId: string;
  };
  eligibility: EligibilityVerdict;
}

/**
 * Load a warranty policy and evaluate its current eligibility.
 * Updates the policy's eligibility snapshot if the status changed.
 */
export async function getWarrantyStatus(
  policyId: string
): Promise<WarrantyStatusResult | null> {
  const policy = await prisma.warrantyPolicy.findUnique({
    where: { id: policyId },
  });
  if (!policy) return null;

  const eligibility = await evaluateForPolicy(policy);

  // Persist the eligibility check result if status changed
  if (eligibility.status !== policy.status) {
    await prisma.warrantyPolicy.update({
      where: { id: policyId },
      data: {
        status: eligibility.status,
        lastEligibilityCheck: new Date(),
        currentScore: eligibility.currentScore,
        consecutiveDaysAboveFloor: eligibility.consecutiveDaysAboveFloor,
        ...(eligibility.status === "ACTIVE" && !policy.activatedAt
          ? { activatedAt: new Date() }
          : {}),
        ...(eligibility.status === "SUSPENDED"
          ? { suspendedAt: new Date(), suspensionCount: policy.suspensionCount + 1 }
          : {}),
      },
    });
  } else {
    // Update the snapshot without changing status
    await prisma.warrantyPolicy.update({
      where: { id: policyId },
      data: {
        lastEligibilityCheck: new Date(),
        currentScore: eligibility.currentScore,
        consecutiveDaysAboveFloor: eligibility.consecutiveDaysAboveFloor,
        totalMonitoredDays: eligibility.consecutiveDaysAboveFloor,
      },
    });
  }

  return {
    policy: {
      id: policy.id,
      tier: policy.tier,
      status: eligibility.status,
      coverageLimit: policy.coverageLimit,
      scoreFloor: policy.scoreFloor,
      monthlyPremium: policy.monthlyPremium,
      enrolledAt: policy.enrolledAt,
      activatedAt: policy.activatedAt,
      expiresAt: policy.expiresAt,
      siteId: policy.siteId,
      workspaceId: policy.workspaceId,
    },
    eligibility,
  };
}

/**
 * Load all warranty policies for a workspace.
 */
export async function getWorkspaceWarranties(workspaceId: string) {
  return prisma.warrantyPolicy.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
}

// ─── Claim Evaluation ────────────────────────────────────────────────────────

/**
 * Evaluate whether a newly submitted claim is eligible for coverage.
 */
export async function evaluateClaim(
  policyId: string,
  incidentDate: Date
): Promise<ClaimVerdict> {
  const policy = await prisma.warrantyPolicy.findUnique({
    where: { id: policyId },
  });
  if (!policy) {
    return {
      eligible: false,
      coverageAmount: 0,
      reasons: ["Policy not found"],
      scoreAtIncident: null,
      wasActiveAtIncident: false,
    };
  }

  // Get scans around the incident (7 days before to incident date)
  const windowStart = new Date(incidentDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const scans = await prisma.scan.findMany({
    where: {
      workspaceId: policy.workspaceId,
      status: "COMPLETED",
      createdAt: { gte: windowStart, lte: incidentDate },
    },
    orderBy: { createdAt: "desc" },
    select: { score: true, createdAt: true },
    take: 50,
  });

  const scanEntries: ScanHistoryEntry[] = scans
    .filter((s) => s.score !== null)
    .map((s) => ({ score: s.score!, scannedAt: s.createdAt }));

  // Verify evidence chain integrity
  const chainIntact = await checkEvidenceChain(policy.workspaceId);

  return evaluateClaimEligibility({
    policy: toPolicyConfig(policy),
    incidentDate,
    scansAroundIncident: scanEntries,
    evidenceChainIntact: chainIntact,
  });
}

// ─── Pricing Quote ───────────────────────────────────────────────────────────

/**
 * Generate a pricing quote for a new warranty enrollment.
 */
export async function getWarrantyQuote(params: {
  workspaceId: string;
  siteId: string;
  tier: "SHIELD" | "FORTRESS" | "VAULT";
  industry: string;
  geography: string;
}): Promise<PricingResult | null> {
  // Get recent scan data for the site
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const scans = await prisma.scan.findMany({
    where: {
      workspaceId: params.workspaceId,
      url: { contains: params.siteId }, // Loose match — the real loader resolves via Site
      status: "COMPLETED",
      createdAt: { gte: ninetyDaysAgo },
    },
    orderBy: { createdAt: "desc" },
    select: { score: true },
    take: 100,
  });

  if (scans.length === 0) return null;

  const scores = scans.map((s) => s.score).filter((s): s is number => s !== null);
  const currentScore = scores[0] ?? 0;
  const historicalAvg = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : currentScore;

  // Get litigation risk score if available
  const riskScore = await prisma.litigationRiskScore.findFirst({
    where: { siteId: params.siteId },
    orderBy: { calculatedAt: "desc" },
    select: { finalScore: true },
  });

  // Check existing claims
  const existingPolicy = await prisma.warrantyPolicy.findUnique({
    where: { workspaceId_siteId: { workspaceId: params.workspaceId, siteId: params.siteId } },
    include: { claims: { where: { status: "APPROVED" } } },
  });

  return calculateWarrantyPremium({
    tier: params.tier,
    currentScore,
    litigationRiskScore: riskScore?.finalScore ?? 50,
    industry: params.industry,
    geography: params.geography,
    historicalScoreAvg: historicalAvg,
    totalScansLast90Days: scans.length,
    previousClaims: existingPolicy?.claims.length ?? 0,
  });
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

async function evaluateForPolicy(
  policy: {
    id: string;
    workspaceId: string;
    siteId: string;
    tier: string;
    status: string;
    scoreFloor: number;
    monitoringGap: number;
    coverageLimit: number;
    enrolledAt: Date;
    activatedAt: Date | null;
    expiresAt: Date | null;
    suspensionCount: number;
    consecutiveDaysAboveFloor: number;
  }
): Promise<EligibilityVerdict> {
  // Get recent scans (last 45 days)
  const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const scans = await prisma.scan.findMany({
    where: {
      workspaceId: policy.workspaceId,
      status: "COMPLETED",
      createdAt: { gte: fortyFiveDaysAgo },
    },
    orderBy: { createdAt: "desc" },
    select: { score: true, createdAt: true },
    take: 100,
  });

  const scanEntries: ScanHistoryEntry[] = scans
    .filter((s) => s.score !== null)
    .map((s) => ({ score: s.score!, scannedAt: s.createdAt }));

  // Verify evidence chain
  const chainIntact = await checkEvidenceChain(policy.workspaceId);

  return evaluateEligibility({
    policy: toPolicyConfig(policy),
    recentScans: scanEntries,
    evidenceChainIntact: chainIntact,
  });
}

function toPolicyConfig(policy: {
  tier: string;
  status: string;
  scoreFloor: number;
  monitoringGap: number;
  coverageLimit: number;
  enrolledAt: Date;
  activatedAt: Date | null;
  expiresAt: Date | null;
  suspensionCount: number;
  consecutiveDaysAboveFloor: number;
}): PolicyConfig {
  return {
    tier: policy.tier as PolicyConfig["tier"],
    status: policy.status as PolicyConfig["status"],
    scoreFloor: policy.scoreFloor,
    monitoringGapHours: policy.monitoringGap,
    coverageLimit: policy.coverageLimit,
    enrolledAt: policy.enrolledAt,
    activatedAt: policy.activatedAt,
    expiresAt: policy.expiresAt,
    suspensionCount: policy.suspensionCount,
    consecutiveDaysAboveFloor: policy.consecutiveDaysAboveFloor,
  };
}

/**
 * Check the workspace's evidence chain integrity.
 * Returns true if intact or if no chain exists yet (new workspace).
 */
async function checkEvidenceChain(workspaceId: string): Promise<boolean> {
  const proofs = await prisma.complianceProof.findMany({
    where: { workspaceId },
    orderBy: { chainIndex: "asc" },
    select: {
      id: true,
      hash: true,
      prevHash: true,
      chainIndex: true,
      issuedAt: true,
      evidence: true,
    },
  });

  if (proofs.length === 0) return true; // No chain yet is OK

  // Use the pure verifyChain function
  const result = verifyChain(
    proofs.map((p) => ({
      id: p.id,
      hash: p.hash,
      prevHash: p.prevHash,
      chainIndex: p.chainIndex,
      issuedAt: p.issuedAt.toISOString(),
      evidence: p.evidence,
    }))
  );

  return result.valid;
}
