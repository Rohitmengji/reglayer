/**
 * RegLayer — Real User Monitoring Events API
 *
 * WHY: Track actual accessibility issues encountered by real users in production.
 * WHAT: POST ingests RUM events (keyboard navigation failures, screen reader errors, etc.).
 * HOW: Accepts batched events from client-side RUM snippet, persists for analytics.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { Prisma } from "@/generated/prisma/client";
import { aggregateEvents, RumEvent, detectDevice, detectAssistiveTech } from "@/lib/rum/collector";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit-middleware";

/**
 * Real User Monitoring API
 *
 * POST /api/rum/events — Receive accessibility barrier events from client snippet
 * GET /api/rum/events — Retrieve aggregated RUM data for dashboard
 */

const eventSchema = z.object({
  type: z.enum([
    "focus-trap",
    "keyboard-nav-failure",
    "missing-label",
    "low-contrast-interaction",
    "missing-alt-interaction",
    "aria-error",
    "screen-reader-issue",
    "touch-target-small",
    "animation-no-reduce",
  ]),
  selector: z.string().max(500),
  page: z.string().url().max(2000),
  timestamp: z.number(),
  sessionId: z.string().max(64),
  viewport: z
    .object({
      width: z.number().positive(),
      height: z.number().positive(),
    })
    .optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

const batchSchema = z.object({
  siteKey: z.string().min(1).max(128),
  events: z.array(eventSchema).min(1).max(50),
  userAgent: z.string().max(500).optional(),
});

/**
 * POST /api/rum/events
 * Receives batched accessibility barrier events from client snippet.
 * Authenticated via site API key (public, embeddable).
 *
 * Events are persisted to the database (RumEventRecord) so they survive
 * Vercel cold starts and are visible across lambda instances. The
 * workspaceId resolved here matches the one the GET handler reads by,
 * so dashboards see the events that were ingested.
 */
export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "rum");
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { siteKey, events, userAgent } = parsed.data;

  // Resolve the owning workspace from the snippet key. The GET handler bakes the
  // workspace member's userId into the snippet URL (?key=<userId>), so the snippet
  // POSTs siteKey = that userId. The previous code hashed siteKey against the
  // apiKey table (keyHash) — which never matched a userId — so every event was
  // stored with workspaceId=null and silently never surfaced on the dashboard
  // (which reads by workspaceId). Resolve via the member instead, restoring the
  // workspace-scoping the GET handler relies on.
  const keyOwner = await prisma.workspaceMember.findFirst({
    where: { userId: siteKey },
    select: { workspaceId: true },
  });

  const workspaceId = keyOwner?.workspaceId ?? null;

  // Enrich events with device/AT detection
  const ua = userAgent || request.headers.get("user-agent") || "";
  const deviceType = detectDevice(ua);
  const assistiveTech = detectAssistiveTech(ua);

  // Persist each event as a durable row. If there's no workspaceId the row
  // is still inserted (workspaceId null) — it just won't surface in any dashboard.
  const result = await prisma.rumEventRecord.createMany({
    data: events.map((e) => ({
      workspaceId,
      siteKey,
      type: e.type,
      selector: e.selector,
      page: e.page,
      sessionId: e.sessionId,
      viewport: e.viewport ?? Prisma.JsonNull,
      details: {
        ...e.details,
        deviceType,
        ...(assistiveTech ? { assistiveTech } : {}),
      },
      userAgent: ua,
      occurredAt: new Date(e.timestamp),
    })),
  });

  return NextResponse.json(
    { received: events.length, total: result.count },
    { status: 200 }
  );
}

/**
 * GET /api/rum/events?period=day
 * Returns aggregated RUM data for the authenticated user's workspace.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const period = (request.nextUrl.searchParams.get("period") || "day") as "hour" | "day" | "week";

  // Find user's workspace
  const member = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
    include: { workspace: true, user: true },
  });

  if (!member) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const workspaceId = member.workspaceId;
  // siteId used purely as the aggregation/snippet key for this workspace
  const siteId = member.userId;

  // Time period window
  const periodMs = {
    hour: 3600_000,
    day: 86400_000,
    week: 604800_000,
  }[period];
  const since = new Date(Date.now() - periodMs);

  // Read durable events scoped to this workspace (matches POST's workspaceId)
  const rows = await prisma.rumEventRecord.findMany({
    where: { workspaceId, occurredAt: { gte: since } },
    orderBy: { occurredAt: "desc" },
    take: 10000,
  });

  // Map DB rows back to the collector's RumEvent shape
  const events: RumEvent[] = rows.map((row) => ({
    type: row.type as RumEvent["type"],
    selector: row.selector,
    page: row.page,
    timestamp: row.occurredAt.getTime(),
    sessionId: row.sessionId,
    viewport: (row.viewport as RumEvent["viewport"]) ?? undefined,
    userAgent: row.userAgent ?? undefined,
    details: (row.details as RumEvent["details"]) ?? undefined,
  }));

  const aggregation = aggregateEvents(events, siteId, period);

  // Also return recent events for the detail view (rows are newest-first)
  const recentEvents = events.slice(0, 50);

  return NextResponse.json({
    aggregation,
    recentEvents,
    snippet: generateSnippetUrl(request.nextUrl.origin, siteId),
  });
}

function generateSnippetUrl(origin: string, siteId: string): string {
  return `${origin}/api/rum/snippet?key=${siteId}`;
}
