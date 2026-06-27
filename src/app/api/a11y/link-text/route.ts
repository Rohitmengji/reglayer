/**
 * POST /api/a11y/link-text — lint link text (WCAG 2.4.4).
 * Body: { links: { text: string, href?: string }[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { applyRateLimit } from "@/lib/rate-limit-middleware";
import { analyzeLinks } from "@/lib/a11y/link-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  links: z.array(z.object({ text: z.string().max(2000), href: z.string().max(2000).optional() })).max(5000),
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

  return NextResponse.json(analyzeLinks(parsed.data.links));
}
