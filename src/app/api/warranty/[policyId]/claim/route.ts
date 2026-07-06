/**
 * RegLayer — Warranty Claim API
 *
 * POST /api/warranty/[policyId]/claim — Submit a new claim
 * GET  /api/warranty/[policyId]/claim — List claims for a policy
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { evaluateClaim } from "@/lib/warranty/loader";
import { z } from "zod";

export const dynamic = "force-dynamic";

const claimSchema = z.object({
  incidentDate: z.string().datetime(),
  claimType: z.enum(["demand_letter", "lawsuit", "regulatory_complaint"]),
  description: z.string().min(20).max(10000),
  demandLetterUrl: z.string().url().optional(),
});

/**
 * GET /api/warranty/[policyId]/claim — List claims
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ policyId: string }> }
) {
  const { policyId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
    select: { workspace: { select: { id: true } } },
  });
  if (!member) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // IDOR: verify policy belongs to workspace
  const policy = await prisma.warrantyPolicy.findFirst({
    where: { id: policyId, workspaceId: member.workspace.id },
  });
  if (!policy) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  const claims = await prisma.warrantyClaim.findMany({
    where: { policyId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ claims });
}

/**
 * POST /api/warranty/[policyId]/claim — Submit a claim
 *
 * Automatically evaluates eligibility and pre-approves if all conditions are met.
 * If conditions are marginal, sets status to UNDER_REVIEW for manual review.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ policyId: string }> }
) {
  const { policyId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
    include: { workspace: true },
  });
  if (!member) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // IDOR: verify policy belongs to workspace
  const policy = await prisma.warrantyPolicy.findFirst({
    where: { id: policyId, workspaceId: member.workspace.id },
  });
  if (!policy) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = claimSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { incidentDate, claimType, description, demandLetterUrl } = parsed.data;
  const incident = new Date(incidentDate);

  // Evaluate claim eligibility using the pure engine
  const verdict = await evaluateClaim(policyId, incident);

  // Create the claim record
  const claim = await prisma.warrantyClaim.create({
    data: {
      policyId,
      incidentDate: incident,
      claimType,
      description,
      demandLetterUrl,
      status: verdict.eligible ? "APPROVED" : "UNDER_REVIEW",
      coveredAmount: verdict.eligible ? verdict.coverageAmount : null,
      denialReason: verdict.eligible ? null : verdict.reasons.join("; "),
      reviewedAt: verdict.eligible ? new Date() : null,
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      action: "warranty.claim_submitted",
      target: claim.id,
      workspaceId: member.workspace.id,
      metadata: {
        policyId,
        claimType,
        incidentDate,
        autoEligible: verdict.eligible,
        scoreAtIncident: verdict.scoreAtIncident,
        coverageAmount: verdict.coverageAmount,
      },
    },
  });

  return NextResponse.json({
    claim,
    verdict: {
      eligible: verdict.eligible,
      coverageAmount: verdict.coverageAmount,
      scoreAtIncident: verdict.scoreAtIncident,
      reasons: verdict.reasons,
    },
    message: verdict.eligible
      ? `Claim auto-approved. Coverage up to $${(verdict.coverageAmount / 100).toLocaleString()} activated.`
      : "Claim submitted for manual review. Our team will evaluate within 48 hours.",
  }, { status: 201 });
}
