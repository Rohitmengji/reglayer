/**
 * RegLayer — Accessibility Statement Generator API
 *
 * WHY: EU law (EN 301 549 Annex C) requires published accessibility statements.
 * WHAT: POST with scan data + org info, returns formatted accessibility statement text.
 * HOW: Uses latest scan results to auto-fill compliance status in a legal template.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { applyRateLimit } from "@/lib/rate-limit-middleware";

/**
 * POST /api/statement/generate
 * 
 * Generates an EU-compliant Accessibility Statement
 * based on the latest scan results.
 * 
 * Required by:
 * - EU Web Accessibility Directive (2016/2102)
 * - European Accessibility Act (2019/882)
 * - EN 301 549 V3.2.1 Clause 12.1
 */
export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "ai");
  if (blocked) return blocked;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    organizationName,
    websiteUrl,
    websiteName,
    contactEmail,
    contactPhone,
    enforcementBody,
    conformanceLevel = "partial",
    nonAccessibleContent = [],
    disproportionateBurden = [],
    preparationDate,
    reviewDate,
    scanId,
  } = body;

  if (!organizationName || !websiteUrl || !websiteName || !contactEmail) {
    return NextResponse.json(
      { error: "organizationName, websiteUrl, websiteName, and contactEmail are required" },
      { status: 400 }
    );
  }

  // Fetch latest scan data if scanId provided
  let scanData = null;
  if (scanId) {
    scanData = await prisma.scan.findUnique({
      where: { id: scanId },
      include: { violations: true },
    });
  } else {
    // Get the most recent completed scan for this URL
    scanData = await prisma.scan.findFirst({
      where: { url: websiteUrl, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      include: { violations: true },
    });
  }

  const score = scanData?.score ?? null;
  const violationCount = scanData?.violations?.length ?? 0;
  const criticalCount = scanData?.critical ?? 0;
  const seriousCount = scanData?.serious ?? 0;

  // Determine conformance status
  let conformanceStatus: "fully" | "partially" | "not" = "partially";
  if (score !== null) {
    if (score >= 95 && criticalCount === 0 && seriousCount === 0) {
      conformanceStatus = "fully";
    } else if (score < 50) {
      conformanceStatus = "not";
    }
  }
  if (conformanceLevel === "full") conformanceStatus = "fully";
  if (conformanceLevel === "none") conformanceStatus = "not";

  const today = new Date().toISOString().split("T")[0];

  const statement = generateStatementHTML({
    organizationName,
    websiteUrl,
    websiteName,
    contactEmail,
    contactPhone,
    enforcementBody,
    conformanceStatus,
    nonAccessibleContent,
    disproportionateBurden,
    preparationDate: preparationDate || today,
    reviewDate: reviewDate || today,
    score,
    violationCount,
    criticalCount,
    seriousCount,
  });

  const markdown = generateStatementMarkdown({
    organizationName,
    websiteUrl,
    websiteName,
    contactEmail,
    contactPhone,
    enforcementBody,
    conformanceStatus,
    nonAccessibleContent,
    disproportionateBurden,
    preparationDate: preparationDate || today,
    reviewDate: reviewDate || today,
    score,
    violationCount,
  });

  return NextResponse.json({
    html: statement,
    markdown,
    metadata: {
      conformanceStatus,
      preparationDate: preparationDate || today,
      reviewDate: reviewDate || today,
      score,
      violationCount,
      standard: "EN 301 549 V3.2.1",
      directive: "EU Directive 2016/2102",
    },
  });
}

interface StatementParams {
  organizationName: string;
  websiteUrl: string;
  websiteName: string;
  contactEmail: string;
  contactPhone?: string;
  enforcementBody?: string;
  conformanceStatus: "fully" | "partially" | "not";
  nonAccessibleContent: string[];
  disproportionateBurden: string[];
  preparationDate: string;
  reviewDate: string;
  score: number | null;
  violationCount: number;
  criticalCount?: number;
  seriousCount?: number;
}

function generateStatementHTML(params: StatementParams): string {
  const conformanceText = {
    fully: "fully conformant",
    partially: "partially conformant",
    not: "not conformant",
  }[params.conformanceStatus];

  const nonAccessibleSection = params.nonAccessibleContent.length > 0
    ? `<h2>Non-accessible Content</h2>
       <p>The content listed below is non-accessible for the following reasons:</p>
       <h3>Non-compliance with the accessibility requirements</h3>
       <ul>${params.nonAccessibleContent.map(item => `<li>${escapeHtml(item)}</li>`).join("\n")}</ul>`
    : "";

  const burdenSection = params.disproportionateBurden.length > 0
    ? `<h3>Disproportionate burden</h3>
       <ul>${params.disproportionateBurden.map(item => `<li>${escapeHtml(item)}</li>`).join("\n")}</ul>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Accessibility Statement — ${escapeHtml(params.websiteName)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; color: #1a1a1a; }
    h1 { font-size: 1.75rem; border-bottom: 2px solid #0066cc; padding-bottom: 0.5rem; }
    h2 { font-size: 1.25rem; margin-top: 2rem; color: #333; }
    h3 { font-size: 1.1rem; color: #555; }
    a { color: #0066cc; }
    .meta { background: #f8f9fa; border-radius: 8px; padding: 1rem; margin: 1rem 0; }
    .meta dt { font-weight: 600; }
    .meta dd { margin-left: 0; margin-bottom: 0.5rem; }
    .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.875rem; font-weight: 500; }
    .badge-full { background: #dcfce7; color: #166534; }
    .badge-partial { background: #fef9c3; color: #854d0e; }
    .badge-not { background: #fee2e2; color: #991b1b; }
  </style>
</head>
<body>
  <h1>Accessibility Statement for ${escapeHtml(params.websiteName)}</h1>
  
  <p><strong>${escapeHtml(params.organizationName)}</strong> is committed to ensuring digital accessibility for people with disabilities. We are continually improving the user experience for everyone and applying the relevant accessibility standards.</p>

  <h2>Conformance Status</h2>
  <p>The <a href="${escapeHtml(params.websiteUrl)}">${escapeHtml(params.websiteName)}</a> is <span class="badge badge-${params.conformanceStatus === "fully" ? "full" : params.conformanceStatus === "partially" ? "partial" : "not"}">${conformanceText}</span> with <strong>EN 301 549 V3.2.1</strong> and <strong>WCAG 2.1 Level AA</strong>.</p>
  ${params.score !== null ? `<p>Current automated accessibility score: <strong>${params.score}%</strong> (${params.violationCount} issues detected).</p>` : ""}

  ${nonAccessibleSection}
  ${burdenSection}

  <h2>Feedback and Contact Information</h2>
  <p>We welcome your feedback on the accessibility of ${escapeHtml(params.websiteName)}. Please let us know if you encounter accessibility barriers:</p>
  <ul>
    <li>E-mail: <a href="mailto:${escapeHtml(params.contactEmail)}">${escapeHtml(params.contactEmail)}</a></li>
    ${params.contactPhone ? `<li>Phone: ${escapeHtml(params.contactPhone)}</li>` : ""}
  </ul>
  <p>We try to respond to accessibility feedback within 5 business days.</p>

  <h2>Enforcement Procedure</h2>
  <p>If you are not satisfied with our response, you can contact the relevant enforcement body:</p>
  <p>${params.enforcementBody ? escapeHtml(params.enforcementBody) : "The national enforcement body designated under EU Directive 2016/2102 for your member state."}</p>

  <h2>Technical Information</h2>
  <dl class="meta">
    <dt>Compliance standard</dt>
    <dd>EN 301 549 V3.2.1 (2021-03) — Accessibility requirements for ICT products and services</dd>
    <dt>WCAG version</dt>
    <dd>Web Content Accessibility Guidelines (WCAG) 2.1 Level AA</dd>
    <dt>Assessment method</dt>
    <dd>Automated testing using RegLayer accessibility scanner with axe-core engine</dd>
    <dt>Statement prepared on</dt>
    <dd>${escapeHtml(params.preparationDate)}</dd>
    <dt>Last reviewed on</dt>
    <dd>${escapeHtml(params.reviewDate)}</dd>
  </dl>

  <footer style="margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e5e5e5; font-size: 0.875rem; color: #666;">
    <p>This statement was generated in accordance with the model accessibility statement from <a href="https://ec.europa.eu/info/law/law-topic/accessibility_en">EU Directive 2016/2102</a> and the European Accessibility Act (Directive 2019/882).</p>
    <p>Generated by <a href="https://reglayer.vercel.app">RegLayer</a> — European Accessibility Act Compliance Platform</p>
  </footer>
</body>
</html>`;
}

function generateStatementMarkdown(params: Omit<StatementParams, "criticalCount" | "seriousCount">): string {
  const conformanceText = {
    fully: "fully conformant",
    partially: "partially conformant",
    not: "not conformant",
  }[params.conformanceStatus];

  const nonAccessible = params.nonAccessibleContent.length > 0
    ? `## Non-accessible Content\n\nThe content listed below is non-accessible:\n\n${params.nonAccessibleContent.map(i => `- ${i}`).join("\n")}\n\n`
    : "";

  const burden = params.disproportionateBurden.length > 0
    ? `### Disproportionate Burden\n\n${params.disproportionateBurden.map(i => `- ${i}`).join("\n")}\n\n`
    : "";

  return `# Accessibility Statement for ${params.websiteName}

**${params.organizationName}** is committed to ensuring digital accessibility for people with disabilities. We are continually improving the user experience for everyone and applying the relevant accessibility standards.

## Conformance Status

The [${params.websiteName}](${params.websiteUrl}) is **${conformanceText}** with **EN 301 549 V3.2.1** and **WCAG 2.1 Level AA**.

${params.score !== null ? `Current automated accessibility score: **${params.score}%** (${params.violationCount} issues detected).\n` : ""}

${nonAccessible}${burden}## Feedback and Contact Information

We welcome your feedback on the accessibility of ${params.websiteName}. Please let us know if you encounter accessibility barriers:

- E-mail: [${params.contactEmail}](mailto:${params.contactEmail})
${params.contactPhone ? `- Phone: ${params.contactPhone}` : ""}

We try to respond to accessibility feedback within 5 business days.

## Enforcement Procedure

${params.enforcementBody || "Contact the national enforcement body designated under EU Directive 2016/2102 for your member state."}

## Technical Information

| Field | Value |
|-------|-------|
| Compliance standard | EN 301 549 V3.2.1 (2021-03) |
| WCAG version | WCAG 2.1 Level AA |
| Assessment method | Automated testing (RegLayer + axe-core) |
| Statement prepared on | ${params.preparationDate} |
| Last reviewed on | ${params.reviewDate} |

---

*This statement was generated in accordance with the model accessibility statement from [EU Directive 2016/2102](https://ec.europa.eu/info/law/law-topic/accessibility_en).*

*Generated by [RegLayer](https://reglayer.vercel.app) — European Accessibility Act Compliance Platform*
`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
