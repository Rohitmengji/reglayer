/**
 * GET /api/cron/sso-health — SSO certificate/health sweep.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET} (same as the other cron routes).
 * On Vercel Hobby (one scheduled cron) this also runs daily by piggybacking on
 * /api/cron/run-schedules; keep this endpoint for manual triggers (curl with the
 * secret) and for Pro plans that schedule it directly in vercel.json.
 */
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/telemetry/logger";
import { runSsoHealthChecks } from "@/lib/sso/health";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logger.warn("Unauthorized SSO health cron attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSsoHealthChecks();
  return NextResponse.json({ ranAt: new Date().toISOString(), ...result });
}
