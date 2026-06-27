/**
 * POST /api/a11y/color-vision — simulate color-vision deficiencies (WCAG 1.4.1).
 * Body: { color: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { applyRateLimit } from "@/lib/rate-limit-middleware";
import { simulateColorVision } from "@/lib/a11y/color-vision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ color: z.string().min(1).max(64) });

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
    return NextResponse.json(simulateColorVision(parsed.data.color));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not simulate color" }, { status: 400 });
  }
}
