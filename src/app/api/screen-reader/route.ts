/**
 * POST /api/screen-reader — Generate screen reader narration for a URL.
 *
 * Returns the full narration sequence simulating how a screen reader
 * would traverse and announce the page content.
 *
 * Body: { url: string }
 * Response: ScreenReaderSnapshot
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { validateScanUrl } from "@/lib/validations/ssrf";
import { consumeCredits } from "@/lib/credits";
import { prisma } from "@/lib/database/prisma";
import { captureNarration } from "@/lib/screen-reader/narration-engine";
import { launchBrowser, isServerless } from "@/lib/scanner/browser/launch";
import { requireFeature } from "@/lib/features/require-feature";
import type { Page } from "playwright-core";

export async function POST(request: NextRequest) {
  try {
    const guard = await requireFeature("analysis");
    if (!guard.allowed) return guard.response;
    // Auth
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Rate limit (same as scan — launches a browser)
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = await rateLimit(`sr:${ip}`, RATE_LIMITS.scan, "scan");
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Please wait." },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    // Parse and validate URL
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const ssrfError = validateScanUrl(url);
    if (ssrfError) {
      return NextResponse.json({ error: ssrfError }, { status: 400 });
    }

    // Credit check (costs 3 credits — same as pageSummary)
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const creditResult = await consumeCredits(user.id, "pageSummary");
    if (!creditResult.success) {
      return NextResponse.json(
        { error: "Insufficient AI credits", creditsRemaining: creditResult.creditsRemaining, cost: creditResult.cost, upgradeRequired: true },
        { status: 429 }
      );
    }

    // Launch browser and capture narration
    let browser = null;
    try {
      browser = await launchBrowser();
      const page: Page = await browser.newPage();

      // Navigate
      const timeout = 30000;
      try {
        if (isServerless()) {
          await page.goto(url, { waitUntil: "networkidle0" as unknown as "load", timeout });
        } else {
          await page.goto(url, { waitUntil: "networkidle", timeout });
        }
      } catch (navError: unknown) {
        const message = navError instanceof Error ? navError.message : "";
        if (!message.includes("Timeout") && !message.includes("timeout")) {
          throw navError;
        }
      }

      // Wait for page to stabilize
      if (isServerless()) {
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(2000);
      }

      // Capture narration
      const snapshot = await captureNarration(page);

      await page.close();

      return NextResponse.json(snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return NextResponse.json({ error: `Screen reader capture failed: ${message}` }, { status: 500 });
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  } catch (outerError) {
    const message = outerError instanceof Error ? outerError.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
