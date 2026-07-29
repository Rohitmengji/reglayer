/**
 * RegLayer — Chat Telemetry Ingest
 *
 * Receives batched client-side chat signals and forwards them to the metrics buffer.
 *
 * WHY THIS ENDPOINT EXISTS: the chat runtime's defining signals — time to first token,
 * queue depth, whether a stream died before `done` — happen in the browser and had no
 * route to the server. Every failure mode in the queue engine was therefore invisible
 * in production.
 *
 * SECURITY POSTURE
 * - Authenticated. An open metrics endpoint is a free cardinality-bomb and spam vector.
 * - Rate limited, because it is called on a timer by every open tab.
 * - Strictly allow-listed. `isValidSignal` runs again here: the client performs the
 *   same check, but the client is not a trust boundary and a crafted POST must not be
 *   able to inject arbitrary metric names or label values into the backend.
 * - No user content is accepted at all, so nothing here can carry prompt text.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { incrementCounter, recordHistogram } from "@/lib/telemetry/metrics";
import { isValidSignal, type ChatSignal } from "@/lib/ai/chat/telemetry";

export const runtime = "nodejs";

/** Bounded array: a single request must not be able to submit unlimited signals. */
const bodySchema = z.object({
  signals: z.array(z.unknown()).max(50),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return new Response("Unauthorized", { status: 401 });
  }

  const limit = await rateLimit(session.user.email, RATE_LIMITS.api);
  if (!limit.success) {
    // Telemetry is best-effort by design; shedding it under pressure is correct.
    return new Response(null, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response("Invalid body", { status: 400 });
  }

  let accepted = 0;
  for (const candidate of parsed.data.signals) {
    // Unknown names and label values are DROPPED, never forwarded. This is the check
    // that actually protects the metrics backend from cardinality explosion.
    if (!isValidSignal(candidate)) continue;

    const signal = candidate as ChatSignal;
    if (signal.kind === "event") {
      incrementCounter(`ai.chat.${signal.name}`, signal.reason ? { reason: signal.reason } : {});
    } else {
      recordHistogram(`ai.chat.${signal.name}`, signal.value);
    }
    accepted += 1;
  }

  return NextResponse.json({ accepted }, { status: 202 });
}
