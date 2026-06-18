/**
 * RegLayer — Compliance Badge API
 *
 * GET /api/badge/[siteId] — Returns an SVG badge showing compliance status.
 * Public endpoint (no auth) — designed to be embedded on websites.
 *
 * Query params:
 *   ?style=flat|plastic|for-the-badge (default: flat)
 *   ?theme=light|dark (default: light)
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/database/prisma";
import { scoreFromStoredViolations } from "@/lib/scoring/reportScore";

interface Params {
  params: Promise<{ siteId: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { siteId } = await params;
  const style = request.nextUrl.searchParams.get("style") || "flat";
  const theme = request.nextUrl.searchParams.get("theme") || "light";

  // Find latest completed scan for this site
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: {
      url: true,
      scans: {
        where: { status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { violations: { select: { impact: true, affectedElements: true } }, createdAt: true },
      },
    },
  });

  if (!site || site.scans.length === 0) {
    return new Response(generateBadgeSvg("RegLayer", "Not Scanned", "#9ca3af", style, theme), {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" },
    });
  }

  const scan = site.scans[0];
  // Canonical score (shared with the report pages, the ?url= badge, and the
  // certificate). Band the color on the precise score; display the rounded
  // integer — and NEVER label it "Compliant" (a WCAG conformance claim the
  // automated scan cannot establish).
  const precise = scoreFromStoredViolations(scan.violations);
  const score = Math.round(precise);
  const statusText = `${score}/100`;
  const color = precise >= 90 ? "#22c55e" : precise >= 70 ? "#eab308" : "#ef4444";

  const svg = generateBadgeSvg("RegLayer", statusText, color, style, theme);

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

function generateBadgeSvg(
  label: string,
  value: string,
  valueColor: string,
  style: string,
  theme: string
): string {
  const labelWidth = label.length * 7 + 12;
  const valueWidth = value.length * 7 + 12;
  const totalWidth = labelWidth + valueWidth;
  const height = style === "for-the-badge" ? 28 : 20;
  const fontSize = style === "for-the-badge" ? 11 : 11;
  const radius = style === "plastic" ? 4 : style === "for-the-badge" ? 3 : 3;

  const labelBg = theme === "dark" ? "#374151" : "#555";
  const textColor = "#fff";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <g>
    <rect width="${labelWidth}" height="${height}" fill="${labelBg}" rx="${radius}"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="${height}" fill="${valueColor}" rx="${radius}"/>
    <rect x="${labelWidth}" width="4" height="${height}" fill="${valueColor}"/>
  </g>
  <g fill="${textColor}" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="${fontSize}">
    <text x="${labelWidth / 2}" y="${height / 2 + 4}" fill="${textColor}">${escapeXml(label)}</text>
    <text x="${labelWidth + valueWidth / 2}" y="${height / 2 + 4}" fill="${textColor}">${escapeXml(value)}</text>
  </g>
</svg>`;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
