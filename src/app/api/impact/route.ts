/**
 * RegLayer — Impact Certificate API
 *
 * POST /api/impact — Generate a new impact certificate
 * GET  /api/impact — List certificates for the workspace
 * GET  /api/impact?slug=X — Public verification (no auth)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { generateImpactCertificate, verifyImpactCertificate } from "@/lib/impact/loader";
import { z } from "zod";

export const dynamic = "force-dynamic";

const generateSchema = z.object({
  siteId: z.string().min(1),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  monthlyTraffic: z.number().int().min(0).optional(),
  conversionRate: z.number().min(0).max(1).optional(),
  avgOrderValue: z.number().int().min(0).optional(), // cents
  industry: z.string().max(50).optional(),
  isPublic: z.boolean().default(false),
});

/**
 * GET /api/impact
 * - ?slug=X → Public verification (no auth required)
 * - Authenticated → List workspace certificates
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const slug = searchParams.get("slug");

  // Public verification mode
  if (slug) {
    const cert = await prisma.impactCertificate.findUnique({
      where: { publicSlug: slug },
    });
    if (!cert || !cert.isPublic) {
      return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
    }

    // Verify hash integrity
    const verification = await verifyImpactCertificate(cert.id);

    return NextResponse.json({
      certificate: cert,
      verified: verification?.valid ?? false,
      verifiedAt: new Date().toISOString(),
    });
  }

  // Authenticated list
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
    select: { workspace: { select: { id: true, plan: true } } },
  });
  if (!member) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  if (member.workspace.plan === "FREE") {
    return NextResponse.json(
      { error: "Impact Certificates require a Pro or Enterprise plan", upgradeRequired: true },
      { status: 403 }
    );
  }

  const certificates = await prisma.impactCertificate.findMany({
    where: { workspaceId: member.workspace.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ certificates });
}

/**
 * POST /api/impact — Generate a new impact certificate
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

  if (member.workspace.plan === "FREE") {
    return NextResponse.json(
      { error: "Impact Certificates require a Pro or Enterprise plan", upgradeRequired: true },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { siteId, periodStart, periodEnd, ...options } = parsed.data;

  // Verify site belongs to workspace
  const site = await prisma.site.findFirst({
    where: { id: siteId, workspaceId: member.workspace.id },
  });
  if (!site) {
    return NextResponse.json({ error: "Site not found in workspace" }, { status: 404 });
  }

  try {
    const result = await generateImpactCertificate({
      workspaceId: member.workspace.id,
      siteId,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      ...options,
    });

    return NextResponse.json({
      certificate: { id: result.id, publicUrl: result.publicUrl },
      impact: result.impact,
    }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to generate certificate";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
