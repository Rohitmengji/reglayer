/**
 * RegLayer — AI Remediation API
 *
 * WHY: Developers need code fix suggestions for accessibility violations.
 * WHAT: POST with violation details, returns AI-generated code fix.
 * HOW: Sends violation context + affected HTML to OpenAI, returns suggested code change.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { validateScanUrl } from "@/lib/validations/ssrf";
import { remediate } from "@/lib/remediation/engine";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit-middleware";

/**
 * Auto-Remediation Edge Layer API
 *
 * POST /api/remediate
 * Fetches a URL, applies accessibility fixes, returns patched HTML.
 *
 * GET /api/remediate?url=<url>
 * Returns remediated HTML directly (for iframe embedding or proxy mode).
 */

const remediateSchema = z.object({
  url: z.string().url(),
  config: z.object({
    enableAltText: z.boolean().default(true),
    enableFormLabels: z.boolean().default(true),
    enableLandmarks: z.boolean().default(true),
    enableSkipLinks: z.boolean().default(true),
    enableFocusOrder: z.boolean().default(true),
    enableLangAttr: z.boolean().default(true),
    enableContrastFixes: z.boolean().default(false),
    enableButtonLabels: z.boolean().default(true),
  }).partial().optional(),
  returnFormat: z.enum(["json", "html"]).default("json"),
});

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "scan");
  if (blocked) return blocked;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Verify user has pro or enterprise plan
  const member = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
    include: { workspace: true },
  });

  if (!member || !["PRO", "ENTERPRISE"].includes(member.workspace.plan)) {
    return NextResponse.json(
      { error: "Auto-remediation requires a Pro or Enterprise plan" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = remediateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { url, config, returnFormat } = parsed.data;

  // SSRF protection
  const ssrfError = validateScanUrl(url);
  if (ssrfError) {
    return NextResponse.json({ error: ssrfError }, { status: 400 });
  }

  try {
    // Fetch the original page
    const response = await fetch(url, {
      headers: {
        "User-Agent": "RegLayer-Remediation/1.0 (accessibility-scanner)",
        Accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${response.status} ${response.statusText}` },
        { status: 502 }
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return NextResponse.json(
        { error: "URL does not return HTML content" },
        { status: 400 }
      );
    }

    const originalHtml = await response.text();

    // Apply remediations
    const result = remediate(originalHtml, config || {});

    if (returnFormat === "html") {
      return new Response(result.html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "X-RegLayer-Fixes": String(result.totalFixes),
          "X-RegLayer-Categories": Object.keys(result.categories).join(","),
        },
      });
    }

    return NextResponse.json({
      url,
      totalFixes: result.totalFixes,
      categories: result.categories,
      fixes: result.fixesApplied.slice(0, 50), // Limit response size
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json({ error: "Request timed out" }, { status: 504 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Remediation failed" },
      { status: 500 }
    );
  }
}

/**
 * GET mode: proxy that returns remediated HTML directly.
 * Designed for embedding or CDN-style usage.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const apiKey = request.nextUrl.searchParams.get("key");

  if (!url) {
    return NextResponse.json({ error: "Missing 'url' parameter" }, { status: 400 });
  }

  // API key auth for GET mode (used by edge script)
  if (!apiKey) {
    return NextResponse.json({ error: "Missing 'key' parameter" }, { status: 401 });
  }

  const { createHash } = await import("crypto");
  const prefix = apiKey.substring(0, 8);
  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  const keyRecord = await prisma.apiKey.findFirst({
    where: { prefix, keyHash, expiresAt: { gt: new Date() } },
  });

  if (!keyRecord) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 403 });
  }

  // SSRF protection
  const ssrfError = validateScanUrl(url);
  if (ssrfError) {
    return NextResponse.json({ error: ssrfError }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "RegLayer-Remediation/1.0 (accessibility-scanner)",
        Accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return new Response(`Failed to fetch: ${response.status}`, { status: 502 });
    }

    const originalHtml = await response.text();
    const result = remediate(originalHtml);

    return new Response(result.html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-RegLayer-Fixes": String(result.totalFixes),
        "Cache-Control": "public, max-age=300", // 5 min cache
      },
    });
  } catch {
    return new Response("Remediation failed", { status: 500 });
  }
}
