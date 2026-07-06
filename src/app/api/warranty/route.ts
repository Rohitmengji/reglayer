/**
 * RegLayer — Warranty API
 *
 * GET  /api/warranty — List warranty policies for the user's workspace
 * POST /api/warranty — Enroll a site in the compliance warranty program
 * GET  /api/warranty?quote=true&siteId=X&tier=Y — Get a pricing quote
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { getWorkspaceWarranties, getWarrantyQuote } from "@/lib/warranty/loader";
import { TIER_COVERAGE } from "@/lib/warranty/eligibility";
import { z } from "zod";

export const dynamic = "force-dynamic";

const enrollSchema = z.object({
  siteId: z.string().min(1),
  tier: z.enum(["SHIELD", "FORTRESS", "VAULT"]),
  industry: z.string().min(1).max(50),
  geography: z.string().min(1).max(20),
  billingInterval: z.enum(["monthly", "annual"]).default("monthly"),
});

/**
 * GET /api/warranty
 * - List all warranty policies for the workspace
 * - Or get a pricing quote with ?quote=true&siteId=X&tier=Y&industry=Z&geography=W
 */
export async function GET(request: NextRequest) {
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

  // Plan gate: warranty requires Enterprise
  if (member.workspace.plan !== "ENTERPRISE") {
    return NextResponse.json(
      { error: "Compliance Warranty requires an Enterprise plan", upgradeRequired: true },
      { status: 403 }
    );
  }

  const { searchParams } = request.nextUrl;

  // Quote mode
  if (searchParams.get("quote") === "true") {
    const siteId = searchParams.get("siteId");
    const tier = searchParams.get("tier") as "SHIELD" | "FORTRESS" | "VAULT" | null;
    const industry = searchParams.get("industry") || "technology";
    const geography = searchParams.get("geography") || "US-OTHER";

    if (!siteId || !tier || !["SHIELD", "FORTRESS", "VAULT"].includes(tier)) {
      return NextResponse.json(
        { error: "Missing or invalid: siteId, tier" },
        { status: 400 }
      );
    }

    const quote = await getWarrantyQuote({
      workspaceId: member.workspace.id,
      siteId,
      tier,
      industry,
      geography,
    });

    if (!quote) {
      return NextResponse.json(
        { error: "Insufficient scan history to generate a quote. Run at least one scan first." },
        { status: 422 }
      );
    }

    return NextResponse.json({ quote });
  }

  // List mode
  const policies = await getWorkspaceWarranties(member.workspace.id);
  return NextResponse.json({ policies });
}

/**
 * POST /api/warranty — Enroll a site in the warranty program
 */
export async function POST(request: NextRequest) {
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

  // Plan gate
  if (member.workspace.plan !== "ENTERPRISE") {
    return NextResponse.json(
      { error: "Compliance Warranty requires an Enterprise plan", upgradeRequired: true },
      { status: 403 }
    );
  }

  // Role gate: only Owners and Admins can enroll warranties
  if (!["OWNER", "ADMIN"].includes(member.role)) {
    return NextResponse.json(
      { error: "Only workspace owners and admins can manage warranty policies" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = enrollSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { siteId, tier, industry, geography, billingInterval } = parsed.data;

  // Verify site belongs to workspace
  const site = await prisma.site.findFirst({
    where: { id: siteId, workspaceId: member.workspace.id },
  });
  if (!site) {
    return NextResponse.json({ error: "Site not found in workspace" }, { status: 404 });
  }

  // Check not already enrolled
  const existing = await prisma.warrantyPolicy.findUnique({
    where: { workspaceId_siteId: { workspaceId: member.workspace.id, siteId } },
  });
  if (existing && existing.status !== "CANCELLED" && existing.status !== "EXPIRED") {
    return NextResponse.json(
      { error: "Site already has an active warranty policy" },
      { status: 409 }
    );
  }

  // Get quote for pricing
  const quote = await getWarrantyQuote({
    workspaceId: member.workspace.id,
    siteId,
    tier,
    industry,
    geography,
  });
  if (!quote) {
    return NextResponse.json(
      { error: "Insufficient scan history. Run scans for at least 7 days before enrolling." },
      { status: 422 }
    );
  }

  const monthlyPremium = billingInterval === "annual"
    ? Math.round(quote.annualPremium / 12)
    : quote.monthlyPremium;

  // Create the warranty policy
  const policy = await prisma.warrantyPolicy.create({
    data: {
      workspaceId: member.workspace.id,
      siteId,
      tier,
      status: "PENDING",
      coverageLimit: TIER_COVERAGE[tier],
      scoreFloor: 75,
      monitoringGap: 48,
      monthlyPremium,
      annualDiscount: billingInterval === "annual" ? quote.annualDiscount : 0,
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      action: "warranty.enrolled",
      target: policy.id,
      workspaceId: member.workspace.id,
      metadata: {
        siteId,
        tier,
        industry,
        geography,
        monthlyPremium,
        coverageLimit: TIER_COVERAGE[tier],
      },
    },
  });

  return NextResponse.json({
    policy,
    message: `Warranty enrolled. ${tier} tier coverage begins after a 30-day qualifying period of continuous monitoring above score ${policy.scoreFloor}.`,
  }, { status: 201 });
}
