/**
 * RegLayer — Design System Scan API
 *
 * WHY: Component libraries need accessibility auditing at the component level.
 * WHAT: POST with component HTML/URL to scan individual UI components in isolation.
 * HOW: Renders component in isolated page context, runs axe-core, returns component-level results.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import {
  scanComponent,
  generateReport,
  COMMON_COMPONENTS,
  ComponentResult,
} from "@/lib/scanner/design-system/scanner";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit-middleware";
import { validateScanUrl, resolvesToInternalIp } from "@/lib/validations/ssrf";

/**
 * Design System Compliance Scanner API
 *
 * POST /api/design-system/scan — Scan a Storybook instance
 * GET /api/design-system/scan — Get last scan report or list presets
 */

const scanSchema = z.object({
  storybookUrl: z.string().url().max(2000),
  components: z
    .array(
      z.object({
        name: z.string().max(100),
        story: z.string().max(200).optional(),
        html: z.string().max(50000),
        url: z.string().max(2000).optional(),
        usageCount: z.number().optional(),
      })
    )
    .min(1)
    .max(200)
    .optional(),
});

// In-memory report store (per user)
const reportStore = new Map<string, ReturnType<typeof generateReport>>();

/**
 * POST /api/design-system/scan
 *
 * Two modes:
 * 1. Provide components[] with HTML → scans directly
 * 2. Provide only storybookUrl → fetches stories.json and scans found components
 */
export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "scan");
  if (blocked) return blocked;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Plan check
  const member = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
    include: { workspace: true },
  });

  if (!member || !["PRO", "ENTERPRISE"].includes(member.workspace.plan)) {
    return NextResponse.json(
      { error: "Design System scanning requires Pro or Enterprise plan" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = scanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { storybookUrl, components: providedComponents } = parsed.data;

  // SSRF guard: validate the user-supplied Storybook URL before any server-side fetch.
  const ssrfError = validateScanUrl(storybookUrl);
  if (ssrfError) {
    return NextResponse.json({ error: ssrfError }, { status: 400 });
  }
  if (await resolvesToInternalIp(storybookUrl)) {
    return NextResponse.json({ error: "URL resolves to a private/internal address" }, { status: 400 });
  }

  let componentResults: ComponentResult[];

  if (providedComponents && providedComponents.length > 0) {
    // Mode 1: Direct HTML scan
    componentResults = providedComponents.map((c) =>
      scanComponent(
        c.name,
        c.story || "default",
        c.html,
        c.url || `${storybookUrl}/?path=/story/${c.name.toLowerCase()}`
      )
    );

    // Apply usage counts
    for (let i = 0; i < componentResults.length; i++) {
      if (providedComponents[i].usageCount) {
        componentResults[i].usageCount = providedComponents[i].usageCount;
      }
    }
  } else {
    // Mode 2: Fetch from Storybook
    try {
      // Try fetching stories.json (Storybook 6+)
      const storiesUrl = new URL("/stories.json", storybookUrl).toString();
      const res = await fetch(storiesUrl, { signal: AbortSignal.timeout(10000) });

      if (res.ok) {
        const storiesData = (await res.json()) as {
          stories?: Record<string, { title?: string; name?: string; importPath?: string }>;
        };
        const stories = storiesData.stories || {};

        componentResults = [];
        const scannedNames = new Set<string>();

        for (const [id, story] of Object.entries(stories)) {
          const title = story.title || id;
          const name = title.split("/").pop() || title;

          // Only scan common component patterns to avoid noise
          const isCommon = COMMON_COMPONENTS.some(
            (c) => name.toLowerCase().includes(c.toLowerCase())
          );
          if (!isCommon || scannedNames.has(name)) continue;
          scannedNames.add(name);

          // Fetch the iframe for this story
          try {
            const iframeUrl = `${storybookUrl}/iframe.html?id=${id}&viewMode=story`;
            const iframeRes = await fetch(iframeUrl, { signal: AbortSignal.timeout(8000) });
            if (iframeRes.ok) {
              const html = await iframeRes.text();
              const result = scanComponent(name, story.name || "default", html, iframeUrl);
              componentResults.push(result);
            }
          } catch {
            // Skip components that fail to load
          }

          // Limit to 50 components
          if (componentResults.length >= 50) break;
        }
      } else {
        // Fallback: try index.json (Storybook 7+)
        const indexUrl = new URL("/index.json", storybookUrl).toString();
        const indexRes = await fetch(indexUrl, { signal: AbortSignal.timeout(10000) });

        if (!indexRes.ok) {
          return NextResponse.json(
            {
              error: "Could not access Storybook. Ensure stories.json or index.json is accessible.",
              hint: "Make sure --docs or --build-sb is enabled, or provide components[] directly.",
            },
            { status: 422 }
          );
        }

        const indexData = (await indexRes.json()) as {
          entries?: Record<string, { title?: string; name?: string; type?: string }>;
        };
        const entries = indexData.entries || {};
        componentResults = [];

        for (const [id, entry] of Object.entries(entries)) {
          if (entry.type !== "story") continue;
          const name = (entry.title || id).split("/").pop() || entry.title || id;
          const isCommon = COMMON_COMPONENTS.some(
            (c) => name.toLowerCase().includes(c.toLowerCase())
          );
          if (!isCommon) continue;

          try {
            const iframeUrl = `${storybookUrl}/iframe.html?id=${id}&viewMode=story`;
            const iframeRes = await fetch(iframeUrl, { signal: AbortSignal.timeout(8000) });
            if (iframeRes.ok) {
              const html = await iframeRes.text();
              componentResults.push(scanComponent(name, entry.name || "default", html, iframeUrl));
            }
          } catch {
            // skip
          }

          if (componentResults.length >= 50) break;
        }
      }
    } catch (err) {
      return NextResponse.json(
        { error: "Failed to fetch Storybook", details: String(err) },
        { status: 502 }
      );
    }
  }

  const report = generateReport(storybookUrl, componentResults);

  // Store report
  reportStore.set(session.user.email, report);

  return NextResponse.json(report);
}

/**
 * GET /api/design-system/scan
 * Returns the last scan report for the authenticated user.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const report = reportStore.get(session.user.email);
  if (!report) {
    return NextResponse.json({
      report: null,
      message: "No scan results yet. POST to /api/design-system/scan to run a scan.",
    });
  }

  return NextResponse.json(report);
}
