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
    // API key authentication (for CI/CD use)
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.replace("Bearer ", "")) {
      return NextResponse.json(
        { error: "Authorization required. Use: Authorization: Bearer <api-key>" },
        { status: 401 }
      );
    }

    const key = await authenticateApiKey(authHeader);
    if (!key) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 403 });
    }

    const body = await request.json();
    const { scanId, siteId } = body;

    if (!scanId || !siteId) {
      return NextResponse.json(
        { error: "Required: scanId, siteId" },
        { status: 400 }
      );
    }

    // S-6: ignore any caller-supplied workspaceId and always scope to the key's
    // workspace. If the body names a different workspace, reject it outright so a
    // valid key can never be pointed at another tenant's data.
    if (body.workspaceId && body.workspaceId !== key.workspaceId) {
      return NextResponse.json(
        { error: "workspaceId does not match the authenticated API key" },
        { status: 403 }
      );
    }

    const verdicts = await evaluateGuard(scanId, siteId, key.workspaceId);

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
