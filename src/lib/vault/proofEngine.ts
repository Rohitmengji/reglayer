/**
 * RegLayer — Compliance Proof Vault Engine (Anchored Evidence Chain)
 *
 * WHY: Organizations need tamper-evident, timestamped compliance records for audits,
 *      legal defense, and regulatory reporting.
 * WHAT: Generates cryptographic proof artifacts from scan data and links them into a
 *       Merkle-style hash chain so that tampering with any single proof — or with the
 *       order/linkage of the set — is detectable by ANY third party from the data alone.
 * HOW: Each proof's hash covers (canonical evidence + prevHash + chainIndex + issuedAt).
 *      Altering one proof's evidence breaks its own hash; altering order/links breaks the
 *      prevHash of every subsequent proof. The hash logic lives in the pure, framework-free
 *      `chain.ts` module so it can be independently verified outside RegLayer.
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { ProofType } from "@/generated/prisma/client";
import {
  computeProofHash,
  verifyProofIntegrity,
  verifyChain,
  type ChainLink,
  type ChainVerificationReport,
} from "@/lib/vault/chain";

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

/** Maximum attempts to win the @@unique([workspaceId, chainIndex]) race. */
const MAX_CHAIN_RETRIES = 3;

/**
 * Best-effort external anchoring stub. If an anchoring service is configured via
 * OPENTIMESTAMPS_URL, this is where a real submission would go. Today it is a graceful
 * no-op that returns null so the chain is fully functional WITHOUT external anchoring.
 */
async function anchorProofHash(hash: string): Promise<string | null> {
  const endpoint = process.env.OPENTIMESTAMPS_URL;
  if (!endpoint) return null;
  // Intentionally not implemented: a real integration would submit `hash` to the
  // timestamping service and return its receipt. We keep this defensive so a
  // misconfigured/unreachable anchor never blocks proof issuance.
  void hash;
  return null;
}

/**
 * Issue a new compliance proof from a completed scan, appending it to the
 * workspace's tamper-evident hash chain.
 */
export async function issueProof(input: CreateProofInput): Promise<{
  id: string;
  hash: string;
  issuedAt: Date;
  chainIndex: number;
  prevHash: string | null;
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

  // Fix issuedAt BEFORE hashing so the value committed by the hash is the value stored.
  const issuedAt = new Date();
  const evidenceJson = JSON.parse(JSON.stringify(evidence)) as Prisma.InputJsonValue;

  // Retry loop to handle the @@unique([workspaceId, chainIndex]) race: two concurrent
  // issues might compute the same chainIndex; the loser re-reads, recomputes, and retries.
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_CHAIN_RETRIES; attempt++) {
    const latest = await prisma.complianceProof.findFirst({
      where: { workspaceId: input.workspaceId },
      orderBy: { chainIndex: "desc" },
      select: { hash: true, chainIndex: true },
    });

    const prevHash = latest?.hash ?? null;
    const chainIndex = latest ? latest.chainIndex + 1 : 0;
    const hash = computeProofHash({
      evidence,
      prevHash,
      chainIndex,
      issuedAt: issuedAt.toISOString(),
    });

    // Best-effort external anchor (no-op unless configured).
    const anchorProof = await anchorProofHash(hash);

    try {
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
          evidence: evidenceJson,
          hash,
          prevHash,
          chainIndex,
          issuedAt,
          anchoredAt: anchorProof ? new Date() : null,
          anchorProof,
          expiresAt: input.expiresAt,
        },
      });

      return {
        id: proof.id,
        hash: proof.hash,
        issuedAt: proof.issuedAt,
        chainIndex: proof.chainIndex,
        prevHash: proof.prevHash,
      };
    } catch (err) {
      // P2002 = unique constraint violation → another proof grabbed this chainIndex.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    `Failed to append proof to chain after ${MAX_CHAIN_RETRIES} attempts (concurrent issuance contention)`,
    { cause: lastError }
  );
}

export interface VerifyProofResult {
  valid: boolean;
  hashValid: boolean;
  chainValid: boolean;
  chainLength: number;
  computedHash: string;
  issuedAt: Date;
  revokedAt: Date | null;
  standard: string;
  title: string;
  hash: string;
  chainIndex: number;
  expiresAt: Date | null;
  issues: ChainVerificationReport["issues"];
}

/**
 * Verify a proof's integrity:
 *  - recompute its own hash over (evidence + prevHash + chainIndex + issuedAt), and
 *  - verify the workspace chain UP TO this proof to confirm linkage is intact.
 *
 * `valid` = own hash valid AND chain valid AND not revoked AND not expired.
 */
export async function verifyProof(proofId: string): Promise<VerifyProofResult> {
  const proof = await prisma.complianceProof.findUnique({
    where: { id: proofId },
  });

  if (!proof) throw new Error("Proof not found");

  // Per-link integrity using the canonical chain hash.
  const selfLink: ChainLink = {
    id: proof.id,
    evidence: proof.evidence,
    prevHash: proof.prevHash,
    chainIndex: proof.chainIndex,
    issuedAt: proof.issuedAt.toISOString(),
    hash: proof.hash,
  };
  const { hashValid, computedHash } = verifyProofIntegrity(selfLink);

  // Load the workspace chain up to and including this proof, then verify linkage.
  const chainRows = await prisma.complianceProof.findMany({
    where: { workspaceId: proof.workspaceId, chainIndex: { lte: proof.chainIndex } },
    orderBy: { chainIndex: "asc" },
    select: { id: true, evidence: true, prevHash: true, chainIndex: true, issuedAt: true, hash: true },
  });

  const links: ChainLink[] = chainRows.map((r) => ({
    id: r.id,
    evidence: r.evidence,
    prevHash: r.prevHash,
    chainIndex: r.chainIndex,
    issuedAt: r.issuedAt.toISOString(),
    hash: r.hash,
  }));

  const chainReport = verifyChain(links);

  const isExpired = proof.expiresAt ? proof.expiresAt.getTime() < Date.now() : false;
  const valid = hashValid && chainReport.valid && !proof.revokedAt && !isExpired;

  return {
    valid,
    hashValid,
    chainValid: chainReport.valid,
    chainLength: chainReport.length,
    computedHash,
    issuedAt: proof.issuedAt,
    revokedAt: proof.revokedAt,
    standard: proof.standard,
    title: proof.title,
    hash: proof.hash,
    chainIndex: proof.chainIndex,
    expiresAt: proof.expiresAt,
    issues: chainReport.issues,
  };
}

/**
 * Verify the ENTIRE tamper-evident chain for a workspace.
 */
export async function verifyWorkspaceChain(workspaceId: string): Promise<ChainVerificationReport> {
  const rows = await prisma.complianceProof.findMany({
    where: { workspaceId },
    orderBy: { chainIndex: "asc" },
    select: { id: true, evidence: true, prevHash: true, chainIndex: true, issuedAt: true, hash: true },
  });

  const links: ChainLink[] = rows.map((r) => ({
    id: r.id,
    evidence: r.evidence,
    prevHash: r.prevHash,
    chainIndex: r.chainIndex,
    issuedAt: r.issuedAt.toISOString(),
    hash: r.hash,
  }));

  return verifyChain(links);
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
  prevHash: string | null;
  chainIndex: number;
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
    prevHash: proof.prevHash,
    chainIndex: proof.chainIndex,
    issuedAt: proof.issuedAt,
    expiresAt: proof.expiresAt,
    revokedAt: proof.revokedAt,
    revokedReason: proof.revokedReason,
    site: proof.site,
  };
}
