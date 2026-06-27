/**
 * POST /api/a11y/alt-text — grade alt-text quality (WCAG 1.1.1).
 * Body: { alt: string | null, decorative?: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { applyRateLimit } from "@/lib/rate-limit-middleware";
import { analyzeAltText } from "@/lib/a11y/alt-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  alt: z.string().max(2000).nullable().optional(),
  decorative: z.boolean().optional(),
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

  return NextResponse.json(analyzeAltText(parsed.data.alt ?? null, { decorative: parsed.data.decorative }));
}
