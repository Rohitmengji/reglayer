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
import { performScan } from "@/services/scanService";
import { authOptions } from "@/lib/auth/config";
import { logger } from "@/lib/telemetry/logger";

export async function POST(request: NextRequest) {
  const apiLogger = logger.withContext({ route: "POST /api/scan" });

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

    // Get user session for notification context
    const session = await getServerSession(authOptions);

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
