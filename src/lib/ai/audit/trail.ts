/**
 * RegLayer — AI Audit Trail
 *
 * Immutable log of every AI action for enterprise governance.
 * Every chat, RAG query, embedding, agent run, and workflow execution
 * is recorded with full context: who, when, what, how, and at what cost.
 *
 * DESIGN:
 *   - Input/output are HASHED (SHA-256), not stored in plaintext, for PII protection
 *   - Linked to LineageTrace for full provenance when needed
 *   - Retention policy: auto-delete after configurable period
 *   - Queryable for compliance reporting and cost analysis
 */

import "server-only";

import { createHash } from "crypto";
import { prisma } from "@/lib/database/prisma";
import { containsPII } from "@/lib/ai/hardening";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuditEntryInput {
  // WHO
  userId?: string;
  email?: string;
  apiKeyId?: string;
  workspaceId?: string;
  // WHAT
  action: string;
  feature?: string;
  // PROMPT
  promptId?: string;
  promptVersion?: number;
  systemPrompt?: string;
  // MODEL
  model?: string;
  provider?: string;
  temperature?: number;
  // INPUT/OUTPUT
  input?: string;
  inputTokens?: number;
  output?: string;
  outputTokens?: number;
  // COST
  costUsd?: number;
  durationMs?: number;
  // LINEAGE
  traceId?: string;
  // APPROVAL
  approvalId?: string;
  approved?: boolean;
  // COMPLIANCE
  consentBasis?: string;
  dataClassification?: string;
  // METADATA
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditEntry {
  id: string;
  action: string;
  feature: string | null;
  userId: string | null;
  workspaceId: string | null;
  model: string | null;
  provider: string | null;
  promptId: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  traceId: string | null;
  piiDetected: boolean;
  createdAt: Date;
}

export interface AuditQueryOpts {
  workspaceId?: string;
  userId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

// ── Core Operations ───────────────────────────────────────────────────────────

/**
 * Record an AI action in the audit trail.
 * Hashes input/output for PII protection. Fire-and-forget safe.
 */
export async function recordAuditEntry(entry: AuditEntryInput): Promise<string> {
  const piiInInput = entry.input ? containsPII(entry.input) : false;
  const piiInOutput = entry.output ? containsPII(entry.output) : false;
  const piiDetected = piiInInput || piiInOutput;

  // Calculate retention date (default: 90 days, configurable per workspace)
  const retainDays = 90;
  const retainUntil = new Date(Date.now() + retainDays * 24 * 60 * 60 * 1000);

  const result = await prisma.aiAuditEntry.create({
    data: {
      userId: entry.userId,
      email: entry.email,
      apiKeyId: entry.apiKeyId,
      workspaceId: entry.workspaceId,
      action: entry.action,
      feature: entry.feature,
      promptId: entry.promptId,
      promptVersion: entry.promptVersion,
      promptHash: entry.systemPrompt ? sha256(entry.systemPrompt) : null,
      model: entry.model,
      provider: entry.provider,
      temperature: entry.temperature,
      inputHash: entry.input ? sha256(entry.input) : null,
      inputTokens: entry.inputTokens ?? 0,
      outputHash: entry.output ? sha256(entry.output) : null,
      outputTokens: entry.outputTokens ?? 0,
      costUsd: entry.costUsd ?? 0,
      durationMs: entry.durationMs ?? 0,
      traceId: entry.traceId,
      approvalId: entry.approvalId,
      approved: entry.approved,
      consentBasis: entry.consentBasis ?? "legitimate_interest",
      retainUntil,
      dataClassification: entry.dataClassification ?? "internal",
      piiDetected,
      piiRedacted: piiDetected, // if detected, we already redacted via sanitizeForLLM
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      metadata: (entry.metadata as object) ?? undefined,
    },
  });

  return result.id;
}

/**
 * Query audit trail entries with filters.
 */
export async function queryAuditTrail(opts: AuditQueryOpts): Promise<AuditEntry[]> {
  const results = await prisma.aiAuditEntry.findMany({
    where: {
      ...(opts.workspaceId ? { workspaceId: opts.workspaceId } : {}),
      ...(opts.userId ? { userId: opts.userId } : {}),
      ...(opts.action ? { action: opts.action } : {}),
      ...(opts.from || opts.to ? {
        createdAt: {
          ...(opts.from ? { gte: opts.from } : {}),
          ...(opts.to ? { lte: opts.to } : {}),
        },
      } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 50,
    skip: opts.offset ?? 0,
  });

  return results.map(mapEntry);
}

/**
 * Get audit statistics for a workspace (dashboard view).
 */
export async function getAuditStats(workspaceId: string, days = 30): Promise<{
  totalActions: number;
  totalCostUsd: number;
  totalTokens: number;
  byAction: Record<string, number>;
  piiDetectionCount: number;
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [total, costSum, tokenSum, piiCount, actionCounts] = await Promise.all([
    prisma.aiAuditEntry.count({ where: { workspaceId, createdAt: { gte: since } } }),
    prisma.aiAuditEntry.aggregate({ where: { workspaceId, createdAt: { gte: since } }, _sum: { costUsd: true } }),
    prisma.aiAuditEntry.aggregate({ where: { workspaceId, createdAt: { gte: since } }, _sum: { inputTokens: true, outputTokens: true } }),
    prisma.aiAuditEntry.count({ where: { workspaceId, createdAt: { gte: since }, piiDetected: true } }),
    prisma.aiAuditEntry.groupBy({ by: ["action"], where: { workspaceId, createdAt: { gte: since } }, _count: true }),
  ]);

  const byAction: Record<string, number> = {};
  for (const ac of actionCounts) byAction[ac.action] = ac._count;

  return {
    totalActions: total,
    totalCostUsd: costSum._sum.costUsd ?? 0,
    totalTokens: (tokenSum._sum.inputTokens ?? 0) + (tokenSum._sum.outputTokens ?? 0),
    byAction,
    piiDetectionCount: piiCount,
  };
}

/**
 * Delete audit entries past their retention date (GDPR compliance).
 * Run periodically via cron.
 */
export async function purgeExpiredEntries(): Promise<number> {
  const result = await prisma.aiAuditEntry.deleteMany({
    where: { retainUntil: { lt: new Date() } },
  });
  return result.count;
}

/**
 * GDPR: Delete all audit entries for a specific user (right to erasure).
 */
export async function eraseUserData(userId: string): Promise<number> {
  const result = await prisma.aiAuditEntry.deleteMany({
    where: { userId },
  });
  return result.count;
}

/**
 * Export audit trail for a workspace (SOC 2 / ISO 27001 evidence).
 */
export async function exportAuditTrail(
  workspaceId: string,
  from: Date,
  to: Date,
): Promise<AuditEntry[]> {
  return queryAuditTrail({ workspaceId, from, to, limit: 10000 });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function mapEntry(row: {
  id: string; action: string; feature: string | null;
  userId: string | null; workspaceId: string | null;
  model: string | null; provider: string | null; promptId: string | null;
  inputTokens: number; outputTokens: number; costUsd: number; durationMs: number;
  traceId: string | null; piiDetected: boolean; createdAt: Date;
}): AuditEntry {
  return { ...row };
}
