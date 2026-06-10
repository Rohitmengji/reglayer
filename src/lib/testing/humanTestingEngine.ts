/**
 * RegLayer — Human Testing Network Engine
 *
 * WHY: Automated scanning catches ~30-40% of accessibility barriers. Real users with
 *      disabilities and certified auditors find the rest (cognitive, motor, sensory issues).
 * WHAT: Marketplace connecting organizations with verified accessibility testers.
 *       Supports booking, test execution, reporting, and combined scoring.
 * HOW: Tester profiles with certifications + audit request flow + structured findings.
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";

export interface TesterProfile {
  id: string;
  name: string;
  email: string;
  bio: string;
  expertise: TesterExpertise[];
  certifications: string[];
  assistiveTech: string[];
  disabilities: string[]; // self-declared for lived-experience testers
  hourlyRate: number;
  currency: string;
  availability: "available" | "limited" | "unavailable";
  completedAudits: number;
  averageRating: number;
  region: string;
  languages: string[];
}

export type TesterExpertise =
  | "screen-reader"
  | "keyboard-navigation"
  | "cognitive"
  | "motor"
  | "low-vision"
  | "color-blind"
  | "deaf-hard-of-hearing"
  | "wcag-audit"
  | "vpat-review"
  | "usability";

export interface AuditRequest {
  id: string;
  workspaceId: string;
  siteId: string;
  testerId: string | null;
  status: AuditStatus;
  type: AuditType;
  scope: string;
  requirements: string;
  urgency: "standard" | "rush" | "critical";
  budget: number | null;
  currency: string;
  findings: AuditFinding[];
  combinedScore: number | null;
  automatedScore: number | null;
  manualScore: number | null;
  createdAt: Date;
  completedAt: Date | null;
}

export type AuditStatus =
  | "draft"
  | "submitted"
  | "matched"
  | "in-progress"
  | "review"
  | "completed"
  | "cancelled";

export type AuditType =
  | "full-audit"
  | "screen-reader-test"
  | "keyboard-test"
  | "cognitive-review"
  | "usability-test"
  | "vpat-validation";

export interface AuditFinding {
  id: string;
  severity: "critical" | "serious" | "moderate" | "minor";
  category: string;
  title: string;
  description: string;
  steps: string;
  expected: string;
  actual: string;
  assistiveTech?: string;
  wcagCriteria?: string;
  screenshot?: string;
  recommendation: string;
}

/**
 * Estimated pricing based on audit type and site complexity.
 */
export const AUDIT_PRICING: Record<AuditType, { base: number; perPage: number; currency: string }> = {
  "full-audit": { base: 2500, perPage: 200, currency: "USD" },
  "screen-reader-test": { base: 800, perPage: 80, currency: "USD" },
  "keyboard-test": { base: 600, perPage: 60, currency: "USD" },
  "cognitive-review": { base: 1200, perPage: 100, currency: "USD" },
  "usability-test": { base: 1500, perPage: 120, currency: "USD" },
  "vpat-validation": { base: 3000, perPage: 0, currency: "USD" },
};

/**
 * Calculate estimated price for an audit.
 */
export function estimateAuditPrice(
  type: AuditType,
  pageCount: number,
  urgency: "standard" | "rush" | "critical"
): { estimate: number; currency: string } {
  const pricing = AUDIT_PRICING[type];
  let estimate = pricing.base + pricing.perPage * Math.max(0, pageCount - 5);

  // Urgency multipliers
  if (urgency === "rush") estimate *= 1.5;
  if (urgency === "critical") estimate *= 2.0;

  return { estimate: Math.round(estimate), currency: pricing.currency };
}

/**
 * Create an audit request.
 */
export async function createAuditRequest(input: {
  workspaceId: string;
  siteId: string;
  type: AuditType;
  scope: string;
  requirements: string;
  urgency: "standard" | "rush" | "critical";
  budget: number | null;
}): Promise<{ id: string }> {
  const audit = await prisma.auditRequest.create({
    data: {
      workspaceId: input.workspaceId,
      siteId: input.siteId,
      type: input.type,
      scope: input.scope,
      requirements: input.requirements,
      urgency: input.urgency,
      budget: input.budget,
      status: "submitted",
    },
  });

  return { id: audit.id };
}

/**
 * List audit requests for a workspace.
 */
export async function listAuditRequests(workspaceId: string): Promise<{
  audits: Array<{
    id: string;
    type: string;
    status: string;
    scope: string;
    urgency: string;
    budget: number | null;
    combinedScore: number | null;
    createdAt: Date;
    completedAt: Date | null;
    site: { id: string; url: string; name: string | null };
    tester: { id: string; name: string } | null;
  }>;
}> {
  const audits = await prisma.auditRequest.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    include: {
      site: { select: { id: true, url: true, name: true } },
      tester: { select: { id: true, name: true } },
    },
  });

  return { audits };
}

/**
 * Submit findings for an audit (tester-side).
 */
export async function submitFindings(
  auditId: string,
  findings: AuditFinding[],
  manualScore: number
): Promise<void> {
  const audit = await prisma.auditRequest.findUnique({
    where: { id: auditId },
    select: { automatedScore: true },
  });

  // Combined score: weighted average (60% automated, 40% manual)
  const automatedScore = audit?.automatedScore ?? 0;
  const combinedScore = automatedScore * 0.6 + manualScore * 0.4;

  await prisma.auditRequest.update({
    where: { id: auditId },
    data: {
      findings: JSON.parse(JSON.stringify(findings)),
      manualScore,
      combinedScore,
      status: "review",
      completedAt: new Date(),
    },
  });
}

/**
 * Get available testers matching audit requirements.
 */
export async function matchTesters(
  type: AuditType,
  region?: string
): Promise<TesterProfile[]> {
  const expertiseMap: Record<AuditType, TesterExpertise[]> = {
    "full-audit": ["wcag-audit"],
    "screen-reader-test": ["screen-reader"],
    "keyboard-test": ["keyboard-navigation"],
    "cognitive-review": ["cognitive"],
    "usability-test": ["usability"],
    "vpat-validation": ["vpat-review"],
  };

  const requiredExpertise = expertiseMap[type] ?? [];

  const testers = await prisma.tester.findMany({
    where: {
      availability: { not: "unavailable" },
      ...(region && { region }),
      expertise: { hasSome: requiredExpertise },
    },
    orderBy: [{ averageRating: "desc" }, { completedAudits: "desc" }],
    take: 10,
  });

  return testers as unknown as TesterProfile[];
}
