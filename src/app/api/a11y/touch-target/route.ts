/**
 * POST /api/a11y/touch-target — evaluate touch-target size (WCAG 2.5.8 / 2.5.5).
 * Body: { width, height, spacing?, inline?, essential?, level? }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { applyRateLimit } from "@/lib/rate-limit-middleware";
import { analyzeTouchTarget } from "@/lib/a11y/touch-target";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  width: z.number().nonnegative().max(100000),
  height: z.number().nonnegative().max(100000),
  spacing: z.number().nonnegative().max(100000).optional(),
  inline: z.boolean().optional(),
  essential: z.boolean().optional(),
  level: z.enum(["AA", "AAA"]).optional(),
});

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

  return NextResponse.json(analyzeTouchTarget(parsed.data));
}
