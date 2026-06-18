/**
 * RegLayer — Violation Status Management
 *
 * WHY: Users need to track remediation progress — "I scanned" → "I fixed" → "Verified."
 *      Without status tracking, the violation list is a permanent wall of red.
 *
 * WHAT: Business logic for updating violation status, verifying fixes via re-scan,
 *       and querying violations with status filtering.
 *
 * HOW: Direct Prisma operations on the Violation model (status, statusNote, etc.).
 *      Verification uses the existing Playwright + axe-core scanner to re-check a single URL.
 */

import { prisma } from "@/lib/database/prisma";
import { ViolationStatus } from "@/generated/prisma/client";
import { runAccessibilityScan } from "@/lib/scanner/accessibility/axeScanner";
import { recordFixOutcome, firstSelector } from "@/lib/genome/recordOutcome";

// ─────────────── Types ───────────────

export interface UpdateStatusInput {
  violationId: string;
  status: ViolationStatus;
  note?: string;
  userId: string;
}

export interface UpdateStatusResult {
  id: string;
  status: ViolationStatus;
  /** The status the violation held BEFORE this update — for the audit trail. */
  previousStatus: ViolationStatus;
  statusNote: string | null;
  statusUpdatedAt: string;
  statusUpdatedBy: string;
}

export interface VerifyFixResult {
  verified: boolean;
  verifiedAt?: string;
  stillFailing?: boolean;
}

export interface ViolationFilter {
  scanId?: string;
  /** A single status, or several (e.g. the Exceptions tab = WONT_FIX + ACCEPTABLE_RISK). */
  status?: ViolationStatus | ViolationStatus[];
  impact?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedViolations {
  violations: ViolationWithStatus[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ViolationWithStatus {
  id: string;
  ruleId: string;
  impact: string;
  description: string;
  help: string;
  helpUrl: string | null;
  tags: string[];
  wcagCriteria: string | null;
  wcagLevel: string | null;
  affectedElements: unknown;
  status: ViolationStatus;
  statusNote: string | null;
  statusUpdatedAt: string | null;
  statusUpdatedBy: string | null;
  statusUpdatedByName: string | null;
  verifiedAt: string | null;
}

// ─────────────── Status Notes Validation ───────────────

/** Statuses that require a note explaining the decision */
const REQUIRES_NOTE: ViolationStatus[] = [
  ViolationStatus.WONT_FIX,
  ViolationStatus.ACCEPTABLE_RISK,
];

// ─────────────── Core Functions ───────────────

/**
 * Update the status of a violation.
 *
 * @param input - Violation ID, new status, optional note, and acting user ID
 * @returns The updated violation status record
 * @throws Error if violation not found, note required but missing, or auth fails
 */
export async function updateViolationStatus(
  input: UpdateStatusInput
): Promise<UpdateStatusResult> {
  const { violationId, status, note, userId } = input;

  // Validate note requirement
  if (REQUIRES_NOTE.includes(status) && (!note || note.trim().length < 10)) {
    throw new StatusValidationError(
      "NOTE_REQUIRED",
      `A note of at least 10 characters is required for status "${status}".`,
      "note"
    );
  }

  // Verify violation exists (and capture its prior status for the audit trail)
  const violation = await prisma.violation.findUnique({
    where: { id: violationId },
    select: { id: true, scanId: true, status: true },
  });

  if (!violation) {
    throw new StatusValidationError(
      "VIOLATION_NOT_FOUND",
      "Violation not found.",
      "violationId"
    );
  }

  // Update status
  const updated = await prisma.violation.update({
    where: { id: violationId },
    data: {
      status,
      statusNote: REQUIRES_NOTE.includes(status) ? note?.trim() : note?.trim() || null,
      statusUpdatedAt: new Date(),
      statusUpdatedBy: userId,
    },
    select: {
      id: true,
      status: true,
      statusNote: true,
      statusUpdatedAt: true,
      statusUpdatedBy: true,
    },
  });

  return {
    id: updated.id,
    status: updated.status,
    previousStatus: violation.status,
    statusNote: updated.statusNote,
    statusUpdatedAt: updated.statusUpdatedAt?.toISOString() ?? new Date().toISOString(),
    statusUpdatedBy: updated.statusUpdatedBy ?? userId,
  };
}

/**
 * Verify a fix by re-scanning the violation's source URL and checking
 * if the specific ruleId still appears in results.
 *
 * @param violationId - The violation to verify
 * @returns Whether the fix was verified (rule no longer appears)
 * @throws Error if violation not found or scan fails
 */
export async function verifyViolationFix(
  violationId: string
): Promise<VerifyFixResult> {
  // Fetch violation with its scan context (URL + tenant + detection time for the genome)
  const violation = await prisma.violation.findUnique({
    where: { id: violationId },
    select: {
      id: true,
      ruleId: true,
      status: true,
      impact: true,
      affectedElements: true,
      scan: { select: { url: true, workspaceId: true, siteId: true, createdAt: true } },
    },
  });

  if (!violation) {
    throw new StatusValidationError(
      "VIOLATION_NOT_FOUND",
      "Violation not found.",
      "violationId"
    );
  }

  // Run a minimal re-scan of the violation's source URL
  const scanResult = await runAccessibilityScan(violation.scan.url, {
    timeout: 25000, // Stay within Vercel's 30s budget
  });

  // Check if the specific rule still appears in violations
  const stillFailing = scanResult.violations.some(
    (v) => v.id === violation.ruleId
  );

  const verifiedAt = new Date();

  // Fix Genome: record the outcome (success OR failure — both are signal). Best-effort;
  // recordFixOutcome never throws, so a pending migration cannot break verification.
  await recordFixOutcome({
    workspaceId: violation.scan.workspaceId,
    siteId: violation.scan.siteId,
    violationId: violation.id,
    ruleId: violation.ruleId,
    selector: firstSelector(violation.affectedElements),
    impact: violation.impact,
    verifiedVia: "re-scan",
    success: !stillFailing,
    detectedAt: violation.scan.createdAt,
    verifiedAt,
  });

  if (!stillFailing) {
    // Fix confirmed — update status to VERIFIED
    await prisma.violation.update({
      where: { id: violationId },
      data: {
        status: ViolationStatus.VERIFIED,
        verifiedAt,
        statusUpdatedAt: verifiedAt,
      },
    });

    return {
      verified: true,
      verifiedAt: verifiedAt.toISOString(),
    };
  }

  return {
    verified: false,
    stillFailing: true,
  };
}

/**
 * Query violations with filtering, pagination, and status info.
 *
 * @param filter - Filter criteria (scanId, status, impact, pagination)
 * @returns Paginated array of violations with status and updater info
 */
export async function getFilteredViolations(
  filter: ViolationFilter
): Promise<PaginatedViolations> {
  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.min(100, Math.max(1, filter.limit ?? 25));
  const skip = (page - 1) * limit;

  // Build where clause
  const where: Record<string, unknown> = {};
  if (filter.scanId) where.scanId = filter.scanId;
  if (filter.status) {
    // One query for one OR many statuses, so a multi-status view (Exceptions =
    // WONT_FIX + ACCEPTABLE_RISK) paginates with a single correct `total`.
    where.status = Array.isArray(filter.status) ? { in: filter.status } : filter.status;
  }
  if (filter.impact) where.impact = filter.impact;

  // Count total for pagination
  const total = await prisma.violation.count({ where });

  // Fetch violations with status ordering: OPEN first, then IN_PROGRESS, then by impact
  const violations = await prisma.violation.findMany({
    where,
    select: {
      id: true,
      ruleId: true,
      impact: true,
      description: true,
      help: true,
      helpUrl: true,
      tags: true,
      wcagCriteria: true,
      wcagLevel: true,
      affectedElements: true,
      status: true,
      statusNote: true,
      statusUpdatedAt: true,
      statusUpdatedBy: true,
      verifiedAt: true,
    },
    orderBy: [
      // Postgres orders enums by their SCHEMA DECLARATION order (not alphabetical).
      // ViolationStatus is declared OPEN, IN_PROGRESS, FIXED, VERIFIED, WONT_FIX,
      // ACCEPTABLE_RISK — so asc puts actionable (OPEN) rows first.
      { status: "asc" },
      // Impact is declared critical, serious, moderate, minor — so asc is true
      // severity order (critical first), again by declaration not alphabet.
      { impact: "asc" },
    ],
    skip,
    take: limit,
  });

  // Batch-fetch user display names for statusUpdatedBy
  const userIds = [...new Set(violations.map((v) => v.statusUpdatedBy).filter(Boolean))] as string[];
  const users = userIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u.name ?? u.email]));

  const mapped: ViolationWithStatus[] = violations.map((v) => ({
    id: v.id,
    ruleId: v.ruleId,
    impact: v.impact,
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl,
    tags: v.tags,
    wcagCriteria: v.wcagCriteria,
    wcagLevel: v.wcagLevel,
    affectedElements: v.affectedElements,
    status: v.status,
    statusNote: v.statusNote,
    statusUpdatedAt: v.statusUpdatedAt?.toISOString() ?? null,
    statusUpdatedBy: v.statusUpdatedBy,
    statusUpdatedByName: v.statusUpdatedBy ? (userMap.get(v.statusUpdatedBy) ?? null) : null,
    verifiedAt: v.verifiedAt?.toISOString() ?? null,
  }));

  return {
    violations: mapped,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Get violation status summary counts for a scan.
 *
 * @param scanId - The scan to summarize
 * @returns Counts per status
 */
export async function getStatusSummary(
  scanId: string
): Promise<Record<ViolationStatus, number>> {
  const counts = await prisma.violation.groupBy({
    by: ["status"],
    where: { scanId },
    _count: { status: true },
  });

  // Initialize all statuses to 0
  const summary: Record<ViolationStatus, number> = {
    [ViolationStatus.OPEN]: 0,
    [ViolationStatus.IN_PROGRESS]: 0,
    [ViolationStatus.FIXED]: 0,
    [ViolationStatus.VERIFIED]: 0,
    [ViolationStatus.WONT_FIX]: 0,
    [ViolationStatus.ACCEPTABLE_RISK]: 0,
  };

  for (const row of counts) {
    summary[row.status] = row._count.status;
  }

  return summary;
}

/**
 * Check if a user has access to a violation's workspace.
 *
 * @param violationId - The violation to check
 * @param userId - The user requesting access
 * @returns true if user is a member of the violation's scan's workspace
 */
export async function userOwnsViolation(
  violationId: string,
  userId: string
): Promise<boolean> {
  const violation = await prisma.violation.findUnique({
    where: { id: violationId },
    select: {
      scan: { select: { workspaceId: true } },
    },
  });

  if (!violation?.scan.workspaceId) return false;

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      userId,
      workspaceId: violation.scan.workspaceId,
    },
    select: { id: true },
  });

  return membership !== null;
}

// ─────────────── Error Types ───────────────

/**
 * Structured error for status validation failures.
 * API routes translate these into proper HTTP responses.
 */
export class StatusValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = "StatusValidationError";
  }
}
