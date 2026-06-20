/**
 * WHY: Vision-augmented accessibility review — catches visually-apparent issues
 *      (text-in-images, color-only meaning, low contrast, missing focus rings)
 *      that DOM/axe scanning cannot see.
 * WHAT: POST /api/scans/[id]/visual — screenshots the scan's URL, sends it to a
 *       vision model, returns + persists AI-suggested findings.
 * HOW: Auth → IDOR (assertScanAccess) → plan gate (advanced tier) → rate limit →
 *      screenshot → analyze → persist into scan.metadata.visualReview.
 *      Findings are AI-SUGGESTED (needs human confirmation) — never in the score.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { assertScanAccess } from "@/lib/auth/access";
import { applyRateLimit } from "@/lib/rate-limit-middleware";
import { hasFeature } from "@/lib/features/feature-access";
import { captureScreenshot } from "@/lib/scanner/browser/screenshot";
import { analyzeScreenshotForA11y } from "@/lib/ai/visualScan";

// Browser launch + screenshot + vision call can take a while.
export const maxDuration = 90;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const rl = await applyRateLimit(request, "api");
    if (rl) return rl;

    const { id } = await params;

    // IDOR guard — caller must own the scan.
    const access = await assertScanAccess(id, session);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    // Feature gate — canonical feature system; master admin bypasses, overrides honored.
    const featureOk =
      access.isMasterAdmin ||
      (access.workspaceId ? (await hasFeature(access.workspaceId, "visualScan")).enabled : false);
    if (!featureOk) {
      return NextResponse.json(
        { error: "AI Visual Review requires a PRO or Enterprise plan", upgradeRequired: true },
        { status: 403 }
      );
    }

    const scan = await prisma.scan.findUnique({
      where: { id },
      select: { url: true, metadata: true },
    });
    if (!scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    // Capture a fresh screenshot of the page (PNG) for the vision model.
    let shot: { data: string };
    try {
      shot = await captureScreenshot(scan.url, { fullPage: false });
    } catch {
      return NextResponse.json(
        { error: "Could not capture a screenshot of the page to review." },
        { status: 422 }
      );
    }

    const { findings, aiGenerated } = await analyzeScreenshotForA11y(shot.data, {
      mime: "image/png",
      userId: user?.id,
    });

    if (!aiGenerated) {
      return NextResponse.json({
        findings: [],
        aiGenerated: false,
        message: "AI visual review is unavailable right now (AI not configured or insufficient credits).",
      });
    }

    // Persist into scan metadata (merge — don't clobber existing keys). JSON
    // round-trip keeps the value a plain InputJsonValue for Prisma.
    const meta = (scan.metadata as Record<string, unknown> | null) ?? {};
    await prisma.scan
      .update({
        where: { id },
        data: {
          metadata: JSON.parse(
            JSON.stringify({ ...meta, visualReview: { findings, generatedAt: new Date().toISOString() } })
          ),
        },
      })
      .catch(() => {
        /* persistence is best-effort; the findings are still returned */
      });

    return NextResponse.json({ findings, aiGenerated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
