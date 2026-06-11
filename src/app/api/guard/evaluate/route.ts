/**
 * POST /api/guard/evaluate — Evaluate a scan against guard policies
 *
 * Used by CI/CD pipelines to check if a scan passes all guard rules.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/auth/api-key";
import { evaluateGuard } from "@/lib/guard/guardEngine";

export async function POST(request: NextRequest) {
  try {
    // API key authentication (required — guard is key-only)
    const keyResult = await authenticateApiKey(request);

    if (keyResult.status === "no-key") {
      return NextResponse.json(
        { error: "Authorization required. Use: Authorization: Bearer <api-key>" },
        { status: 401 }
      );
    }

    if (keyResult.status === "invalid") {
      return NextResponse.json({ error: "Invalid or expired API key" }, { status: 403 });
    }

    const body = await request.json();
    const { scanId, siteId, workspaceId } = body;

    if (!scanId || !siteId || !workspaceId) {
      return NextResponse.json(
        { error: "Required: scanId, siteId, workspaceId" },
        { status: 400 }
      );
    }

    const verdicts = await evaluateGuard(scanId, siteId, workspaceId);

    const allPassed = verdicts.length === 0 || verdicts.every((v) => v.passed);

    return NextResponse.json({
      passed: allPassed,
      verdicts,
      summary: verdicts.length === 0
        ? "No guard policies configured"
        : allPassed
          ? `All ${verdicts.length} guard policies passed`
          : `${verdicts.filter((v) => !v.passed).length}/${verdicts.length} policies failed`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
