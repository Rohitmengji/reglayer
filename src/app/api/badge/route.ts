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
    select: { score: true },
  });

  if (!latestScan || latestScan.score === null) {
    return new Response(renderBadge(label, "not scanned", "#9ca3af", style), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  const score = Math.round(latestScan.score);
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
