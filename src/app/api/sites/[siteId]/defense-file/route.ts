/**
 * RegLayer — Litigation Defense File API
 *
 * GET / POST /api/sites/[siteId]/defense-file?format=html|json
 *
 * Assembles a chronological, hash-verified "good-faith remediation effort" dossier
 * for a single site from data RegLayer already records (scan time series, violation
 * status transitions, re-scan verifications, Anchored Evidence Chain proofs).
 *
 * Read-only. NO migration, NO mutation, NO proof issuance. Access is gated on BOTH
 * verbs via assertSiteAccess (deliberately NOT copying the weaker VPAT GET, which
 * skips the ownership check). HTML output is fully escaped by the renderer.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { assertSiteAccess } from "@/lib/auth/access";
import { loadDefenseFileData } from "@/lib/defense/loadDefenseFileData";
import { assembleDefenseFile, renderDefenseFileHTML } from "@/lib/defense/defenseFile";

type Format = "html" | "json";

const formatSchema = z.enum(["html", "json"]);

/** Strip anything that could break a Content-Disposition filename (quotes, slashes, etc.). */
function safeFilename(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned.length ? cleaned.slice(0, 80) : "site";
}

async function buildResponse(siteId: string, format: Format): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const access = await assertSiteAccess(siteId, session);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, url: true, name: true, workspaceId: true },
  });
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const data = await loadDefenseFileData({ site, generatedAt: new Date() });
  const file = assembleDefenseFile(data);

  if (format === "json") {
    return NextResponse.json(file);
  }

  const html = renderDefenseFileHTML(file);
  const filename = `RegLayer-Defense-File-${safeFilename(site.name ?? site.url)}.html`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
): Promise<Response> {
  try {
    const { siteId } = await params;
    const raw = request.nextUrl.searchParams.get("format") ?? "html";
    const parsed = formatSchema.safeParse(raw);
    const format: Format = parsed.success ? parsed.data : "html";
    return await buildResponse(siteId, format);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
): Promise<Response> {
  try {
    const { siteId } = await params;
    let format: Format = "html";
    try {
      const body = await request.json();
      const parsed = formatSchema.safeParse(body?.format);
      if (parsed.success) format = parsed.data;
    } catch {
      // No / invalid JSON body — default to HTML download.
    }
    return await buildResponse(siteId, format);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
