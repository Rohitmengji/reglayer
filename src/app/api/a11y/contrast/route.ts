/**
 * POST /api/a11y/contrast — WCAG color-contrast analysis + accessible-color fix.
 *
 * WHY: Contrast (WCAG 1.4.3 / 1.4.6) is the most common violation. This endpoint
 *      doesn't just score a pair — when it fails the requested level it returns
 *      the nearest HUE-PRESERVING color that passes (and says so honestly when no
 *      color can satisfy the target against that background).
 * Body: { foreground, background, level?: "AA"|"AAA", largeText?: boolean }
 *       Colors accept #rgb, #rrggbb, bare hex, or rgb()/rgba().
 * Pure compute (no DB); auth-gated + rate-limited like the rest of the API.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { applyRateLimit } from "@/lib/rate-limit-middleware";
import { analyzeContrast } from "@/lib/a11y/contrast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  foreground: z.string().min(1).max(64),
  background: z.string().min(1).max(64),
  level: z.enum(["AA", "AAA"]).optional(),
  largeText: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "api");
  if (blocked) return blocked;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const { foreground, background, level, largeText } = parsed.data;
    return NextResponse.json(analyzeContrast(foreground, background, { level, largeText }));
  } catch (e) {
    // analyzeContrast throws only on an unparseable color — that's a client error.
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not analyze colors" }, { status: 400 });
  }
}
