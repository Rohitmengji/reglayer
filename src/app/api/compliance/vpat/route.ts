/**
 * RegLayer — VPAT (Voluntary Product Accessibility Template) API
 *
 * WHY: Enterprise procurement requires VPAT documents to evaluate product accessibility.
 * WHAT: GET/POST generates a VPAT document from scan results in Section 508 format.
 * HOW: Maps scan violations to VPAT criteria sections, generates structured document.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { generateVPAT, vpatToMarkdown, vpatToHTML } from "@/lib/compliance/vpat-generator";
import type { VPATViolation, VPATInput } from "@/lib/compliance/vpat-generator";
import { assertScanAccess } from "@/lib/auth/access";
import { z } from "zod";

/**
 * VPAT/ACR Generator API
 *
 * POST /api/compliance/vpat
 * Generate a VPAT/ACR document from scan data.
 *
 * GET /api/compliance/vpat?scanId=<id>&format=html
 * Quick generation from a scan with default settings.
 */

const vpatSchema = z.object({
  scanId: z.string(),
  productName: z.string().min(1),
  productVersion: z.string().optional(),
  productDescription: z.string().optional(),
  vendorName: z.string().min(1),
  vendorContact: z.string().optional(),
  standard: z.enum(["WCAG21-A", "WCAG21-AA", "WCAG21-AAA", "Section508", "EN301549"]).default("WCAG21-AA"),
  format: z.enum(["json", "markdown", "html"]).default("json"),
  notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Plan check — VPAT is enterprise feature
  const member = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
    include: { workspace: true },
  });

  if (!member || !["PRO", "ENTERPRISE"].includes(member.workspace.plan)) {
    return NextResponse.json(
      { error: "VPAT/ACR generation requires a Pro or Enterprise plan" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = vpatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { scanId, format, ...vpatConfig } = parsed.data;

  // Ownership check — the caller must own the scan being attested.
  const access = await assertScanAccess(scanId, session);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  // Fetch scan with violations
  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    include: { violations: true },
  });

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  // Map DB violations to VPAT format
  const violations: VPATViolation[] = scan.violations.map((v) => {
    const elements = Array.isArray(v.affectedElements)
      ? (v.affectedElements as Array<{ html: string }>)
      : [];

    return {
      ruleId: v.ruleId,
      impact: v.impact,
      wcagCriteria: v.tags.filter((t) => t.match(/^wcag\d/)).map(tagToWcagId),
      description: v.description,
      help: v.help,
      affectedCount: elements.length,
    };
  });

  // Generate VPAT document, layering in human-attested manual verdicts where present
  const manualVerdicts = await loadManualVerdicts(scan.siteId);
  const vpatDoc = generateVPAT({
    ...vpatConfig,
    scanData: {
      url: scan.url,
      score: scan.score ?? 0,
      totalViolations: scan.totalViolations ?? 0,
      violations,
      scanDate: scan.createdAt.toISOString(),
    },
    manualVerdicts,
  });

  // Return in requested format
  if (format === "html") {
    const html = vpatToHTML(vpatDoc);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="ACR-${vpatConfig.productName.replace(/\s+/g, "-")}.html"`,
      },
    });
  }

  if (format === "markdown") {
    const md = vpatToMarkdown(vpatDoc);
    return new Response(md, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="ACR-${vpatConfig.productName.replace(/\s+/g, "-")}.md"`,
      },
    });
  }

  return NextResponse.json(vpatDoc);
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const scanId = request.nextUrl.searchParams.get("scanId");
  const format = request.nextUrl.searchParams.get("format") || "json";

  if (!scanId) {
    return NextResponse.json({ error: "Missing 'scanId' parameter" }, { status: 400 });
  }

  // IDOR guard: only the scan's owner/workspace may generate its VPAT.
  const access = await assertScanAccess(scanId, session);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    include: { violations: true },
  });

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const violations: VPATViolation[] = scan.violations.map((v) => {
    const elements = Array.isArray(v.affectedElements)
      ? (v.affectedElements as Array<{ html: string }>)
      : [];

    return {
      ruleId: v.ruleId,
      impact: v.impact,
      wcagCriteria: v.tags.filter((t) => t.match(/^wcag\d/)).map(tagToWcagId),
      description: v.description,
      help: v.help,
      affectedCount: elements.length,
    };
  });

  const manualVerdicts = await loadManualVerdicts(scan.siteId);
  const vpatDoc = generateVPAT({
    productName: new URL(scan.url).hostname,
    vendorName: session.user.name || "Organization",
    standard: "WCAG21-AA",
    scanData: {
      url: scan.url,
      score: scan.score ?? 0,
      totalViolations: scan.totalViolations ?? 0,
      violations,
      scanDate: scan.createdAt.toISOString(),
    },
    manualVerdicts,
  });

  if (format === "html") {
    return new Response(vpatToHTML(vpatDoc), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (format === "markdown") {
    return new Response(vpatToMarkdown(vpatDoc), {
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  }

  return NextResponse.json(vpatDoc);
}

/**
 * Load the latest manual-test audit's human-attested verdicts for a site, so the
 * VPAT/ACR can report human-determined conformance for the criteria automation
 * can't decide — instead of inferring everything from the automated scan alone.
 * Returns undefined when there's no manual testing on record.
 */
async function loadManualVerdicts(siteId: string | null): Promise<VPATInput["manualVerdicts"]> {
  if (!siteId) return undefined;
  const audit = await prisma.auditRequest.findFirst({
    where: { siteId, type: "manual-test" },
    orderBy: { createdAt: "desc" },
    select: { findings: true },
  });
  const plan = audit?.findings as unknown as {
    items?: Array<{ criterion: string; verdict: string; attestedBy: string | null }>;
  } | null;
  if (!plan?.items) return undefined;
  const verdicts = plan.items
    .filter((it) => it.verdict === "pass" || it.verdict === "fail" || it.verdict === "na")
    .map((it) => ({
      criterion: it.criterion,
      verdict: it.verdict as "pass" | "fail" | "na",
      attestedBy: it.attestedBy,
    }));
  return verdicts.length > 0 ? verdicts : undefined;
}

/**
 * Convert axe WCAG tag to criterion ID.
 * e.g., "wcag111" → "1.1.1", "wcag143" → "1.4.3"
 */
function tagToWcagId(tag: string): string {
  const match = tag.match(/^wcag(\d)(\d)(\d+)$/);
  if (!match) return tag;
  return `${match[1]}.${match[2]}.${match[3]}`;
}
