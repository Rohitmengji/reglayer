/**
 * GET /api/scan/[scanId]/thumbnail
 *
 * Serves the stored viewport screenshot for a single scan as a raw image,
 * for the live "watch the crawl" viewport and filmstrip.
 *
 * WHY a dedicated endpoint (vs. inlining the image in the SSE stream):
 * - Keeps the crawl event stream lean — screenshots are lazy-loaded by the
 *   browser via <img src> only for pages actually shown, and are cached.
 * - Lets a large crawl stay memory-bounded: the image lives on the Scan row,
 *   never buffered into the in-memory crawl result.
 *
 * SECURITY: ownership is asserted through the shared assertScanAccess helper
 * (master-admin bypass → workspace membership → legacy userId), so this never
 * leaks another tenant's screenshot. A denial maps straight to its HTTP status.
 */

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { assertScanAccess } from "@/lib/auth/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Detect the image type from the leading bytes of a base64 payload. */
function sniffImageType(base64: string): "image/png" | "image/jpeg" {
  // PNG magic "\x89PNG" → base64 "iVBORw0KGgo"; JPEG "\xFF\xD8\xFF" → "/9j/".
  return base64.startsWith("iVBOR") ? "image/png" : "image/jpeg";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const { scanId } = await params;
  const session = await getServerSession(authOptions);

  const access = await assertScanAccess(scanId, session);
  if (!access.ok) {
    return new Response(access.error, { status: access.status });
  }

  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    select: { screenshot: true },
  });

  // A base64 data: URL prefix may be present on legacy rows — strip it.
  const raw = scan?.screenshot ?? null;
  const base64 = raw?.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
  if (!base64) {
    return new Response("No screenshot available for this scan", { status: 404 });
  }

  let body: Buffer;
  try {
    body = Buffer.from(base64, "base64");
  } catch {
    return new Response("Screenshot is not decodable", { status: 422 });
  }

  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": sniffImageType(base64),
      // A scan's screenshot is immutable; cache aggressively but keep it
      // private since the endpoint is ownership-gated.
      "Cache-Control": "private, max-age=86400, immutable",
      "Content-Length": String(body.length),
    },
  });
}
