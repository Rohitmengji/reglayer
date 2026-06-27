/**
 * POST /api/a11y/palette — generate an accessible tonal ramp for a brand color.
 * Body: { color: string, steps?: number }
 * Returns the ramp (each shade scored vs white/black) + the readable text color.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { applyRateLimit } from "@/lib/rate-limit-middleware";
import { generateRamp, bestTextColor } from "@/lib/a11y/palette";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ color: z.string().min(1).max(64), steps: z.number().int().min(2).max(20).optional() });

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "api");
  if (blocked) return blocked;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }, { status: 400 });

  try {
    const palette = generateRamp(parsed.data.color, parsed.data.steps);
    return NextResponse.json({ ...palette, bestTextOnBase: bestTextColor(parsed.data.color) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not generate palette" }, { status: 400 });
  }
}
