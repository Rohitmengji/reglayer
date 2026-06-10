/**
 * POST /api/guard/evaluate — Evaluate a scan against guard policies
 *
 * Used by CI/CD pipelines to check if a scan passes all guard rules.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/database/prisma";
import { evaluateGuard } from "@/lib/guard/guardEngine";

export async function POST(request: NextRequest) {
  try {
    // API key authentication (for CI/CD use)
    const authHeader = request.headers.get("authorization");
    const apiKey = authHeader?.replace("Bearer ", "");

    if (!apiKey) {
      return NextResponse.json(
        { error: "Authorization required. Use: Authorization: Bearer <api-key>" },
        { status: 401 }
      );
    }

    const prefix = apiKey.substring(0, 8);
    const keyHash = createHash("sha256").update(apiKey).digest("hex");
    const keyRecord = await prisma.apiKey.findFirst({
      where: { prefix, keyHash, expiresAt: { gt: new Date() } },
    });

    if (!keyRecord) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 403 });
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
