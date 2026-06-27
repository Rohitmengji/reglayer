/**
 * POST /api/a11y/focus-order — lint keyboard focus order (WCAG 2.4.3 / 2.1.1).
 * Body: { elements: { label?, tabindex?, interactive?, visible? }[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { applyRateLimit } from "@/lib/rate-limit-middleware";
import { analyzeFocusOrder } from "@/lib/a11y/focus-order";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  elements: z.array(z.object({
    label: z.string().max(2000).optional(),
    tabindex: z.number().int().min(-1000).max(100000).optional(),
    interactive: z.boolean().optional(),
    visible: z.boolean().optional(),
  })).max(5000),
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

  return NextResponse.json(analyzeFocusOrder(parsed.data.elements));
}
