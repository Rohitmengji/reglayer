/**
 * RegLayer — Compliance Proof Vault Engine
 *
 * WHY: Organizations need tamper-evident, timestamped compliance records for audits,
 *      legal defense, and regulatory reporting.
 * WHAT: Generates cryptographic proof artifacts from scan data with integrity hashes.
 * HOW: SHA-256 hash of evidence payload ensures proofs cannot be altered after issuance.
 */

import "server-only";

import { createHash } from "crypto";
import { prisma } from "@/lib/database/prisma";
import type { ProofType } from "@/generated/prisma/client";

export interface ProofEvidence {
  scanId: string;
  url: string;
  score: number;
  totalViolations: number;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  compliance: number | null;
  scannedAt: string;
  pageTitle: string | null;
  rulesSummary: Array<{ ruleId: string; count: number; impact: string }>;
}

export interface CreateProofInput {
  siteId: string;
  scanId: string;
  workspaceId: string;
  type: ProofType;
  title: string;
  description?: string;
  standard: string;
  expiresAt?: Date;
}

/**
 * Generate a SHA-256 integrity hash from evidence payload.
 * Used to verify the proof has not been tampered with.
 */
function generateHash(evidence: ProofEvidence): string {
  const canonical = JSON.stringify(evidence, Object.keys(evidence).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Issue a new compliance proof from a completed scan.
 */
export async function issueProof(input: CreateProofInput): Promise<{
  id: string;
  hash: string;
  issuedAt: Date;
}> {
  const scan = await prisma.scan.findUnique({
    where: { id: input.scanId },
    include: {
      violations: {
        select: { ruleId: true, impact: true },
      },
    },
  });

  if (!scan) throw new Error("Scan not found");
  if (scan.status !== "COMPLETED") throw new Error("Scan must be completed to issue proof");

  // Build rule summary
  const ruleCounts = new Map<string, { count: number; impact: string }>();
  for (const v of scan.violations) {
    const existing = ruleCounts.get(v.ruleId);
    if (existing) {
      existing.count++;
    } else {
      ruleCounts.set(v.ruleId, { count: 1, impact: v.impact });
    }
  }

  const evidence: ProofEvidence = {
    scanId: scan.id,
    url: scan.url,
    score: scan.score ?? 0,
    totalViolations: scan.totalViolations,
    critical: scan.critical,
    serious: scan.serious,
    moderate: scan.moderate,
    minor: scan.minor,
    compliance: scan.compliance,
    scannedAt: (scan.completedAt ?? scan.createdAt).toISOString(),
    pageTitle: scan.pageTitle,
    rulesSummary: Array.from(ruleCounts.entries())
      .map(([ruleId, data]) => ({ ruleId, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
  };

  const hash = generateHash(evidence);

  const proof = await prisma.complianceProof.create({
    data: {
      siteId: input.siteId,
      scanId: input.scanId,
      workspaceId: input.workspaceId,
      type: input.type,
      title: input.title,
      description: input.description,
      score: scan.score,
      standard: input.standard,
      evidence: JSON.parse(JSON.stringify(evidence)),
      hash,
      expiresAt: input.expiresAt,
    },
  });

  return { id: proof.id, hash: proof.hash, issuedAt: proof.issuedAt };
}

/**
 * Verify a proof's integrity by recomputing the hash.
 */
export async function verifyProof(proofId: string): Promise<{
  valid: boolean;
  proof: {
    id: string;
    title: string;
    hash: string;
    issuedAt: Date;
    revokedAt: Date | null;
  };
  computedHash: string;
}> {
  const proof = await prisma.complianceProof.findUnique({
    where: { id: proofId },
  });

  if (!proof) throw new Error("Proof not found");

  const evidence = proof.evidence as unknown as ProofEvidence;
  const computedHash = generateHash(evidence);

  return {
    valid: computedHash === proof.hash && !proof.revokedAt,
    proof: {
      id: proof.id,
      title: proof.title,
      hash: proof.hash,
      issuedAt: proof.issuedAt,
      revokedAt: proof.revokedAt,
    },
    computedHash,
  };
}

/**
 * Revoke a proof (e.g., score dropped below threshold).
 */
export async function revokeProof(proofId: string, reason: string): Promise<void> {
  await prisma.complianceProof.update({
    where: { id: proofId },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

/**
 * List all proofs for a workspace, ordered by most recent.
 */
export async function listProofs(workspaceId: string, options?: {
  siteId?: string;
  type?: ProofType;
  limit?: number;
  offset?: number;
}): Promise<{
  proofs: Array<{
    id: string;
    type: ProofType;
    title: string;
    score: number | null;
    standard: string;
    hash: string;
    issuedAt: Date;
    expiresAt: Date | null;
    revokedAt: Date | null;
    site: { id: string; url: string; name: string | null };
  }>;
  total: number;
}> {
  const where = {
    workspaceId,
    ...(options?.siteId && { siteId: options.siteId }),
    ...(options?.type && { type: options.type }),
  };

  const [proofs, total] = await Promise.all([
    prisma.complianceProof.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
      select: {
        id: true,
        type: true,
        title: true,
        score: true,
        standard: true,
        hash: true,
        issuedAt: true,
        expiresAt: true,
        revokedAt: true,
        site: { select: { id: true, url: true, name: true } },
      },
    }),
    prisma.complianceProof.count({ where }),
  ]);

  return { proofs, total };
}

/**
 * Get a single proof with full evidence data.
 */
export async function getProof(proofId: string): Promise<{
  id: string;
  type: ProofType;
  title: string;
  description: string | null;
  score: number | null;
  standard: string;
  evidence: ProofEvidence;
  hash: string;
  issuedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
  site: { id: string; url: string; name: string | null };
} | null> {
  const proof = await prisma.complianceProof.findUnique({
    where: { id: proofId },
    include: { site: { select: { id: true, url: true, name: true } } },
  });

  if (!proof) return null;

  return {
    id: proof.id,
    type: proof.type,
    title: proof.title,
    description: proof.description,
    score: proof.score,
    standard: proof.standard,
    evidence: proof.evidence as unknown as ProofEvidence,
    hash: proof.hash,
    issuedAt: proof.issuedAt,
    expiresAt: proof.expiresAt,
    revokedAt: proof.revokedAt,
    revokedReason: proof.revokedReason,
    site: proof.site,
  };
}
