/**
 * POST /api/compliance/regulations — which accessibility laws apply, to what
 * WCAG level, and by when, for a given business profile.
 * Body: { region?, isPublicSector?, governmentLevel?, sellsToEU?, sector?,
 *         employees?, annualRevenueEur?, populationServed? }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { applyRateLimit } from "@/lib/rate-limit-middleware";
import { assessRegulations } from "@/lib/compliance/regulations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  region: z.enum(["US", "EU", "UK", "CA", "OTHER"]).optional(),
  isPublicSector: z.boolean().optional(),
  governmentLevel: z.enum(["federal", "state_local", "none"]).optional(),
  sellsToEU: z.boolean().optional(),
  sector: z.enum(["ecommerce", "banking", "transport", "ebooks", "telecom", "media", "other"]).optional(),
  employees: z.number().int().nonnegative().max(100_000_000).optional(),
  annualRevenueEur: z.number().nonnegative().max(1e15).optional(),
  populationServed: z.number().int().nonnegative().max(1e10).optional(),
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

  return NextResponse.json(assessRegulations(parsed.data));
}
