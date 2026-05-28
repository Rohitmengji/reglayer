/**
 * RegLayer — Badge API
 *
 * WHY: Sites can embed a compliance badge to show their accessibility score.
 * WHAT: GET returns an SVG badge image with the site's current score.
 * HOW: Queries latest scan for the given URL, renders SVG with score color-coded (green/yellow/red).
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/database/prisma";

/**
 * Accessibility Score Badge API
 * 
 * GET /api/badge?url=<encodedUrl>&style=flat|flat-square|plastic
 * 
 * Returns an SVG badge (like shields.io) showing the latest
 * accessibility score for a given URL. Embed in READMEs, dashboards, etc.
 * 
 * Usage:
 *   ![Accessibility](https://reglayer.vercel.app/api/badge?url=https://example.com)
 */

function recalculateScore(violations: { impact: string; affectedElements: unknown }[]): number {
  if (violations.length === 0) return 100;
  const severityBase: Record<string, number> = {
    CRITICAL: 10, critical: 10, SERIOUS: 5, serious: 5,
    MODERATE: 2, moderate: 2, MINOR: 0.5, minor: 0.5,
  };
  const totalPenalty = violations.reduce((sum, v) => {
    const base = severityBase[v.impact] ?? 1;
    const nodes = Array.isArray(v.affectedElements) ? v.affectedElements : [];
    const nodeCount = Math.max(1, nodes.length);
    return sum + base * (1 + Math.log2(nodeCount) / 4);
  }, 0);
  return Math.round(Math.max(0, Math.min(100, 100 - totalPenalty)));
}
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const style = request.nextUrl.searchParams.get("style") || "flat";
  const label = request.nextUrl.searchParams.get("label") || "accessibility";

  if (!url) {
    return new Response(renderBadge(label, "no url", "#9ca3af", style), {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-cache" },
    });
  }

  // Find the most recent completed scan for this URL
  const latestScan = await prisma.scan.findFirst({
    where: { url, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    select: { score: true, violations: { select: { impact: true, affectedElements: true } } },
  });

  if (!latestScan) {
    return new Response(renderBadge(label, "not scanned", "#9ca3af", style), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // Recalculate score from violations for accuracy
  const score = recalculateScore(latestScan.violations);
  const color = getScoreColor(score);
  const value = `${score}/100`;

  return new Response(renderBadge(label, value, color, style), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}

function getScoreColor(score: number): string {
  if (score >= 90) return "#22c55e"; // green
  if (score >= 70) return "#eab308"; // yellow
  if (score >= 50) return "#f97316"; // orange
  return "#ef4444"; // red
}

function renderBadge(
  label: string,
  value: string,
  color: string,
  style: string
): string {
  const labelWidth = label.length * 6.5 + 12;
  const valueWidth = value.length * 6.5 + 12;
  const totalWidth = labelWidth + valueWidth;

  const radius = style === "flat-square" ? "0" : "3";
  const shadow = style === "plastic" ? `<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".15"/><stop offset="1" stop-opacity=".15"/></linearGradient>` : "";
  const overlay = style === "plastic" ? `<rect width="${totalWidth}" height="20" fill="url(#s)" rx="${radius}"/>` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <defs>${shadow}</defs>
  <clipPath id="r"><rect width="${totalWidth}" height="20" rx="${radius}" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    ${overlay}
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="${labelWidth / 2}" y="14">${escapeXml(label)}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${escapeXml(value)}</text>
  </g>
</svg>`;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
