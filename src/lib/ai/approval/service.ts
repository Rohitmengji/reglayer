/**
 * RegLayer — Human Approval Workflow Service
 *
 * AI generates drafts → Human reviews → Approves/Rejects → Publishes.
 *
 * WHY: Enterprise compliance requires human oversight of AI-generated content.
 * A compliance report, accessibility statement, or certificate CANNOT go live
 * without a qualified human sign-off. This is a legal requirement.
 *
 * ARCHITECTURE:
 *   AI Feature → createApprovalRequest() → Pending in queue
 *   Reviewer UI → listPendingApprovals() → Reviews content
 *   Reviewer → approve() or reject() → Triggers downstream action
 *   System → publish() → Executes the approved action (send email, update page)
 *
 * INSPIRED BY:
 *   - GitHub PR reviews (draft → review → approve → merge)
 *   - Notion AI (generate → edit → publish)
 *   - Legal doc platforms (draft → review → sign → execute)
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ApprovalType =
  | "COMPLIANCE_REPORT"
  | "ACCESSIBILITY_STATEMENT"
  | "REMEDIATION_PLAN"
  | "CERTIFICATE"
  | "POLICY_UPDATE";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "PUBLISHED";

export interface ApprovalRequestEntry {
  id: string;
  type: ApprovalType;
  status: ApprovalStatus;
  title: string;
  content: unknown;
  metadata: unknown;
  requestedBy: string;
  reviewedBy: string | null;
  reviewNote: string | null;
  reviewedAt: Date | null;
  workspaceId: string;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface CreateApprovalInput {
  type: ApprovalType;
  title: string;
  content: unknown;
  metadata?: unknown;
  requestedBy: string;
  workspaceId: string;
  expiresAt?: Date;
}

// ── Core Operations ───────────────────────────────────────────────────────────

/**
 * Submit AI-generated content for human review.
 * Called after any AI generation that requires sign-off before publishing.
 */
export async function createApprovalRequest(input: CreateApprovalInput): Promise<ApprovalRequestEntry> {
  const result = await prisma.approvalRequest.create({
    data: {
      type: input.type,
      title: input.title,
      content: input.content as object,
      metadata: (input.metadata as object) ?? undefined,
      requestedBy: input.requestedBy,
      workspaceId: input.workspaceId,
      expiresAt: input.expiresAt ?? null,
    },
  });

  return mapToEntry(result);
}

/**
 * List pending approval requests for a workspace.
 * Used by the reviewer queue UI.
 */
export async function listPendingApprovals(
  workspaceId: string,
  opts?: { type?: ApprovalType; limit?: number },
): Promise<ApprovalRequestEntry[]> {
  const results = await prisma.approvalRequest.findMany({
    where: {
      workspaceId,
      status: "PENDING",
      ...(opts?.type ? { type: opts.type } : {}),
    },
    orderBy: { createdAt: "asc" }, // oldest first (FIFO)
    take: opts?.limit ?? 50,
  });

  return results.map(mapToEntry);
}

/**
 * Get a single approval request by ID (with workspace ownership check).
 */
export async function getApprovalRequest(
  id: string,
  workspaceId: string,
): Promise<ApprovalRequestEntry | null> {
  const result = await prisma.approvalRequest.findFirst({
    where: { id, workspaceId },
  });

  return result ? mapToEntry(result) : null;
}

/**
 * Approve a pending request. Transitions to APPROVED status.
 * The approved content can then be published by a subsequent action.
 */
export async function approveRequest(
  id: string,
  reviewerId: string,
  note?: string,
): Promise<ApprovalRequestEntry | null> {
  const result = await prisma.approvalRequest.updateMany({
    where: { id, status: "PENDING" },
    data: {
      status: "APPROVED",
      reviewedBy: reviewerId,
      reviewNote: note ?? null,
      reviewedAt: new Date(),
    },
  });

  if (result.count === 0) return null;

  const updated = await prisma.approvalRequest.findUnique({ where: { id } });
  return updated ? mapToEntry(updated) : null;
}

/**
 * Reject a pending request with feedback.
 * The requester can revise and resubmit.
 */
export async function rejectRequest(
  id: string,
  reviewerId: string,
  note: string,
): Promise<ApprovalRequestEntry | null> {
  const result = await prisma.approvalRequest.updateMany({
    where: { id, status: "PENDING" },
    data: {
      status: "REJECTED",
      reviewedBy: reviewerId,
      reviewNote: note,
      reviewedAt: new Date(),
    },
  });

  if (result.count === 0) return null;

  const updated = await prisma.approvalRequest.findUnique({ where: { id } });
  return updated ? mapToEntry(updated) : null;
}

/**
 * Mark an approved request as published (executed).
 * Called after the downstream action completes (email sent, page updated, etc.).
 */
export async function markPublished(id: string): Promise<boolean> {
  const result = await prisma.approvalRequest.updateMany({
    where: { id, status: "APPROVED" },
    data: { status: "PUBLISHED" },
  });
  return result.count > 0;
}

/**
 * Expire stale pending requests older than the given date.
 * Run periodically (e.g., weekly cron) to clean up abandoned drafts.
 */
export async function expireStaleRequests(olderThan: Date): Promise<number> {
  const result = await prisma.approvalRequest.updateMany({
    where: {
      status: "PENDING",
      OR: [
        { expiresAt: { lt: new Date() } },
        { createdAt: { lt: olderThan } },
      ],
    },
    data: { status: "EXPIRED" },
  });
  return result.count;
}

/**
 * Get approval history for a workspace (all statuses).
 * Used by the audit log / history view.
 */
export async function getApprovalHistory(
  workspaceId: string,
  opts?: { limit?: number; offset?: number },
): Promise<ApprovalRequestEntry[]> {
  const results = await prisma.approvalRequest.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: opts?.limit ?? 25,
    skip: opts?.offset ?? 0,
  });

  return results.map(mapToEntry);
}

/**
 * Count pending approvals for a workspace (badge number in UI).
 */
export async function countPending(workspaceId: string): Promise<number> {
  return prisma.approvalRequest.count({
    where: { workspaceId, status: "PENDING" },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapToEntry(row: {
  id: string;
  type: string;
  status: string;
  title: string;
  content: unknown;
  metadata: unknown;
  requestedBy: string;
  reviewedBy: string | null;
  reviewNote: string | null;
  reviewedAt: Date | null;
  workspaceId: string;
  createdAt: Date;
  expiresAt: Date | null;
}): ApprovalRequestEntry {
  return {
    id: row.id,
    type: row.type as ApprovalType,
    status: row.status as ApprovalStatus,
    title: row.title,
    content: row.content,
    metadata: row.metadata,
    requestedBy: row.requestedBy,
    reviewedBy: row.reviewedBy,
    reviewNote: row.reviewNote,
    reviewedAt: row.reviewedAt,
    workspaceId: row.workspaceId,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}
