/**
 * ---------------------------------------------------------
 * RegLayer — Scan API Route
 * ---------------------------------------------------------
 *
 * Purpose:
 * HTTP endpoint for initiating accessibility scans.
 *
 * Why this exists:
 * This is the system boundary where external requests
 * enter the scanning infrastructure. All validation
 * happens here before delegating to the service layer.
 *
 * Engineering Notes:
 * - Validates ALL input with Zod schemas.
 * - Delegates to service layer immediately.
 * - Returns structured error responses.
 * - API routes should be THIN.
 * ---------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { scanRequestSchema } from "@/lib/validations/scan";
import { validateScanUrl } from "@/lib/validations/ssrf";
import { performScan } from "@/services/scanService";
import { authOptions } from "@/lib/auth/config";
import { logger } from "@/lib/telemetry/logger";
import { getPlanContext, getMonthlyScansCount } from "@/lib/credits/plan-context";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const apiLogger = logger.withContext({ route: "POST /api/scan" });

  // Authentication required
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Rate limit by IP
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = rateLimit(`scan:${ip}`, RATE_LIMITS.scan);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before scanning again." },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  try {
    const body = await request.json();

    // Validate input at system boundary
    const parseResult = scanRequestSchema.safeParse(body);

    if (!parseResult.success) {
      apiLogger.warn("Invalid scan request", {
        errors: parseResult.error.flatten(),
      });

      return NextResponse.json(
        {
          error: "Invalid request",
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { url, options } = parseResult.data;

    // SSRF protection — block internal/private addresses
    const ssrfError = validateScanUrl(url);
    if (ssrfError) {
      return NextResponse.json({ error: ssrfError }, { status: 400 });
    }

    // Enforce scan limit
    const planCtx = await getPlanContext();
    if (planCtx && !planCtx.isMasterAdmin) {
      const limit = planCtx.limits.scansPerMonth;
      if (limit !== -1) {
        const used = await getMonthlyScansCount(planCtx.userId);
        if (used >= limit) {
          return NextResponse.json(
            { error: `Scan limit reached (${limit}/month on ${planCtx.plan} plan). Upgrade for more scans.`, upgradeRequired: true },
            { status: 429 }
          );
        }
      }
    }

    // Delegate to service layer
    const result = await performScan({ url, options, userEmail: session?.user?.email || undefined });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    apiLogger.error("Scan request failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      {
        error: "Scan failed",
        message:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
