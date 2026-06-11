/**
 * RegLayer — Remediation Beacon API
 *
 * WHY: Client-side remediation overlay needs to report fix confirmations.
 * WHAT: POST receives beacon events when a user applies a fix suggestion.
 * HOW: Accepts lightweight event payload, logs to analytics. Non-blocking.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/database/prisma";
import { createHash } from "crypto";

/**
 * GET /api/remediate/beacon?key=<api-key>&fixes=<count>&url=<page-url>
 *
 * Analytics beacon for the client-side remediation script.
 * Tracks how many fixes are being applied across sites.
 * Returns a 1x1 transparent pixel.
 */
export async function GET(request: NextRequest) {
  const apiKey = request.nextUrl.searchParams.get("key") || "";
  const fixCount = parseInt(request.nextUrl.searchParams.get("fixes") || "0", 10);

  // Validate API key (non-blocking — fire and forget)
  if (apiKey && fixCount > 0) {
    const prefix = apiKey.substring(0, 8);
    const keyHash = createHash("sha256").update(apiKey).digest("hex");

    // Log remediation analytics (best-effort, don't block response)
    prisma.apiKey
      .findFirst({ where: { prefix, keyHash } })
      .then((keyRecord) => {
        if (!keyRecord) return;
        // Update usage tracking
        return prisma.apiKey.update({
          where: { id: keyRecord.id },
          data: { lastUsedAt: new Date() },
        });
      })
      .catch(() => {});
  }

  // Return 1x1 transparent GIF
  const pixel = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64"
  );

  return new Response(pixel, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-cache, no-store",
      "Content-Length": String(pixel.length),
    },
  });
}
