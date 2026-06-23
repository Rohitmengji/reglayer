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
import { authenticateApiKey } from "@/lib/auth/api-key";
import { validateScanUrl, resolvesToInternalIp } from "@/lib/validations/ssrf";
import { remediate, type FixRecord } from "@/lib/remediation/engine";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit-middleware";

/** Plain-English summary of an applied fix for the remediation UI. */
const FIX_LABELS: Record<string, string> = {
  "image-alt": "Added descriptive alt text to an image",
  "input-image-alt": "Added alt text to an image button",
  "link-name": "Added discernible text to a link",
  "button-name": "Added an accessible name to a button",
  "label": "Associated a label with a form field",
  "color-contrast": "Adjusted colors to meet the contrast ratio",
  "html-has-lang": "Set the page language attribute",
  "document-title": "Added a descriptive page title",
  "aria-required-attr": "Added a required ARIA attribute",
  "frame-title": "Added a title to a frame",
};
function describeFix(f: FixRecord): string {
  const base = FIX_LABELS[f.category] ?? `Fixed ${f.category.replace(/-/g, " ")}`;
  return f.selector ? `${base} (${f.selector})` : base;
}


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

  // SSRF protection — literal/encoding/private-range check (validateScanUrl) AND a
  // DNS-resolution check (resolvesToInternalIp): a public hostname can resolve to
  // an internal IP. The original code ran only the sync check.
  const ssrfError = validateScanUrl(url);
  if (ssrfError) {
    return NextResponse.json({ error: ssrfError }, { status: 400 });
  }
  if (await resolvesToInternalIp(url)) {
    return NextResponse.json(
      { error: "URL resolves to a private/internal address" },
      { status: 400 }
    );
  }

  try {
    // Fetch the original page. Redirects are NOT followed (redirect: "manual"):
    // a validated public URL can 3xx to an internal/metadata address, and this
    // route reflects the fetched body back to the caller, so chasing redirects
    // would re-open SSRF (F031). A 3xx is rejected below.
    const response = await fetch(url, {
      headers: {
        "User-Agent": "RegLayer-Remediation/1.0 (accessibility-scanner)",
        Accept: "text/html",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });

    if (response.status >= 300 && response.status < 400) {
      return NextResponse.json(
        { error: "The URL redirected. RegLayer does not follow redirects when remediating — please provide the final URL." },
        { status: 400 }
      );
    }

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
      // Attach a human-readable description per fix — the UI renders
      // fix.description, which the raw FixRecord (category/selector/before/after)
      // didn't include, leaving the list blank.
      fixes: result.fixesApplied.slice(0, 50).map((f) => ({
        ...f,
        description: describeFix(f),
      })),
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
  // Rate-limit the proxy: GET performs a server-side fetch on the caller's behalf,
  // so without metering it can be abused as an open relay / amplification vector
  // (POST is already rate-limited; GET was not).
  const blocked = await applyRateLimit(request, "scan");
  if (blocked) return blocked;

  const url = request.nextUrl.searchParams.get("url");
  const apiKey = request.nextUrl.searchParams.get("key");

  if (!url) {
    return NextResponse.json({ error: "Missing 'url' parameter" }, { status: 400 });
  }

  // API key auth for GET mode (used by edge script)
  if (!apiKey) {
    return NextResponse.json({ error: "Missing 'key' parameter" }, { status: 401 });
  }

  // The key arrives as a bare query param (no "Bearer " prefix);
  // authenticateApiKey strips that prefix if present and handles bare keys too.
  const key = await authenticateApiKey(apiKey);
  if (!key) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 403 });
  }

  // Plan gate — auto-remediation is Pro/Enterprise. POST enforces this on the
  // session's workspace; GET authenticates by API key, so resolve the plan from
  // the key's workspace. Without this a Free-plan key got unlimited remediation
  // (the gate was POST-only).
  const workspace = await prisma.workspace.findUnique({
    where: { id: key.workspaceId },
    select: { plan: true },
  });
  if (!workspace || !["PRO", "ENTERPRISE"].includes(workspace.plan)) {
    return NextResponse.json(
      { error: "Auto-remediation requires a Pro or Enterprise plan" },
      { status: 403 }
    );
  }

  // SSRF protection — literal/private-range check + DNS resolution (a public
  // hostname can resolve to an internal IP). The original code ran only the sync
  // check.
  const ssrfError = validateScanUrl(url);
  if (ssrfError) {
    return NextResponse.json({ error: ssrfError }, { status: 400 });
  }
  if (await resolvesToInternalIp(url)) {
    return NextResponse.json(
      { error: "URL resolves to a private/internal address" },
      { status: 400 }
    );
  }

  try {
    // Redirects are NOT followed (redirect: "manual"): a validated public URL can
    // 3xx to an internal/metadata address, and this proxy reflects the fetched
    // body back to the caller, so chasing redirects would re-open SSRF (F031).
    const response = await fetch(url, {
      headers: {
        "User-Agent": "RegLayer-Remediation/1.0 (accessibility-scanner)",
        Accept: "text/html",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });

    if (response.status >= 300 && response.status < 400) {
      return new Response(
        "The URL redirected. RegLayer does not follow redirects — provide the final URL.",
        { status: 400 }
      );
    }

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
