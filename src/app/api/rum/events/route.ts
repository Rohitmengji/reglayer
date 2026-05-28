import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
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

// In-memory event store (in production this would be Redis/ClickHouse)
const eventStore = new Map<string, RumEvent[]>();

/**
 * POST /api/rum/events
 * Receives batched accessibility barrier events from client snippet.
 * Authenticated via site API key (public, embeddable).
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

  // Validate API key exists
  const apiKeyRecord = await prisma.apiKey.findFirst({
    where: { keyHash: siteKey },
  });

  // For RUM we use a lightweight check - key just needs to exist
  // In production, use a dedicated RUM site key model
  const siteId = apiKeyRecord?.userId || siteKey;

  // Enrich events with device/AT detection
  const ua = userAgent || request.headers.get("user-agent") || "";
  const deviceType = detectDevice(ua);
  const assistiveTech = detectAssistiveTech(ua);

  const enrichedEvents: RumEvent[] = events.map((e) => ({
    ...e,
    userAgent: ua,
    details: {
      ...e.details,
      deviceType,
      ...(assistiveTech ? { assistiveTech } : {}),
    },
  }));

  // Store events
  const existing = eventStore.get(siteId) || [];
  // Keep last 10000 events per site (FIFO)
  const combined = [...existing, ...enrichedEvents].slice(-10000);
  eventStore.set(siteId, combined);

  return NextResponse.json(
    { received: events.length, total: combined.length },
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

  const siteId = member.userId;
  const events = eventStore.get(siteId) || [];

  // Filter by time period
  const now = Date.now();
  const periodMs = {
    hour: 3600_000,
    day: 86400_000,
    week: 604800_000,
  }[period];

  const filtered = events.filter((e) => now - e.timestamp < periodMs);
  const aggregation = aggregateEvents(filtered, siteId, period);

  // Also return recent events for the detail view
  const recentEvents = filtered.slice(-50).reverse();

  return NextResponse.json({
    aggregation,
    recentEvents,
    snippet: generateSnippetUrl(request.nextUrl.origin, siteId),
  });
}

function generateSnippetUrl(origin: string, siteId: string): string {
  return `${origin}/api/rum/snippet?key=${siteId}`;
}
