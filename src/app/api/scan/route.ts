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
import { requireFeature } from "@/lib/features/require-feature";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { AuthenticationError } from "@/lib/scanner/auth";
import { classifyError } from "@/lib/errors/scan-errors";
import { cacheSetNX, cacheDel } from "@/lib/cache/redis";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { trackScanDuration, incrementCounter } from "@/lib/telemetry/metrics";

// Allow up to 90 seconds for scan execution (browser launch + navigation + axe analysis)
export const maxDuration = 90;

export async function POST(request: NextRequest) {
  const apiLogger = logger.withContext({ route: "POST /api/scan" });

  // Authentication required
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Authorization — running a scan requires scans.run (MEMBER and above).
  // A VIEWER has read-only access and cannot trigger scans.
  const perm = await requireWorkspacePermission("scans.run");
  if (!perm.ok) return perm.response;

  // Rate limit by IP
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await rateLimit(`scan:${ip}`, RATE_LIMITS.scan, "scan");
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before scanning again." },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  let dedupKey = "";
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

    // Dedup — prevent same user scanning same URL within 30s window
    dedupKey = `scan:dedup:${session.user.email}:${url}`;
    const isNew = await cacheSetNX(dedupKey, 1, 30);
    if (!isNew) {
      return NextResponse.json(
        { error: "This URL is already being scanned. Please wait for the current scan to finish." },
        { status: 409 }
      );
    }

    // Enforce scan limit (resolved via role + plan hierarchy)
    const planCtx = await getPlanContext();
    if (planCtx) {
      const limit = planCtx.effectiveScansPerMonth;
      if (limit !== -1) {
        const used = await getMonthlyScansCount(planCtx.workspaceId);
        if (used >= limit) {
          return NextResponse.json(
            { error: `Scan limit reached (${limit}/month on ${planCtx.plan} plan). Upgrade for more scans.`, upgradeRequired: true },
            { status: 429 }
          );
        }
      }
    }

    // Deep Scan is a paid capability — gate via the canonical feature system, which
    // bypasses master admin, reads the WORKSPACE plan, and honors admin feature
    // overrides (the old check read user.plan and never let master admin through).
    if (options?.deep) {
      const gate = await requireFeature("deepScan");
      if (!gate.allowed) {
        await cacheDel(dedupKey);
        return NextResponse.json(
          { error: "Deep Scan requires a PRO or Enterprise plan.", upgradeRequired: true },
          { status: 403 }
        );
      }
    }

    // Delegate to service layer
    const scanStart = Date.now();
    const result = await performScan({ url, options, userEmail: session?.user?.email || undefined });

    // Track scan metrics
    trackScanDuration(Date.now() - scanStart, options?.region || "default");
    incrementCounter("scan.completed", { region: options?.region || "default" });

    // Clear dedup lock after successful scan
    await cacheDel(dedupKey);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    // Clear dedup lock on failure so user can retry
    if (typeof dedupKey === "string") await cacheDel(dedupKey);

    // Structured auth error — return without exposing internals
    if (error instanceof AuthenticationError) {
      return NextResponse.json(error.toResponse(), { status: 401 });
    }

    apiLogger.error("Scan request failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    // Classify the error for better client UX
    const { status, code, message } = classifyError(error);

    return NextResponse.json(
      { error: "Scan failed", message, code },
      { status }
    );
  }
}

