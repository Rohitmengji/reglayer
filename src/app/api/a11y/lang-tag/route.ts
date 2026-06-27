/**
 * POST /api/a11y/lang-tag — validate a BCP-47 language tag (WCAG 3.1.1 / 3.1.2).
 * Body: { tag: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { applyRateLimit } from "@/lib/rate-limit-middleware";
import { validateLangTag } from "@/lib/a11y/lang-tag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ tag: z.string().max(100) });

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

  return NextResponse.json(validateLangTag(parsed.data.tag));
}
