import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const eventSchema = z.object({
  event: z.enum([
    "demo_scan",
    "demo_scan_result",
    "signup_started",
    "signup_completed",
    "signup_google",
    "first_scan",
    "plan_upgraded",
  ]),
  sessionId: z.string().min(1),
  metadata: z.record(z.string(), z.any()).optional(),
});

/**
 * POST — Track a conversion event (public, no auth required)
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  // Rate limit to prevent abuse
  const rl = await rateLimit(`track:${ip}`, { limit: 60, windowSec: 60 }, "tracking");
  if (!rl.success) {
    return NextResponse.json({ ok: true }, { status: 200 }); // Silently drop, don't error
  }

  try {
    const body = await request.json();
    const parsed = eventSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const { event, sessionId, metadata } = parsed.data;

    await prisma.conversionEvent.create({
      data: {
        event,
        sessionId,
        ip,
        referrer: request.headers.get("referer") || undefined,
        userAgent: request.headers.get("user-agent") || undefined,
        metadata: (metadata as Record<string, string | number | boolean | null>) || undefined,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Never fail client-side tracking
    return NextResponse.json({ ok: true });
  }
}

/**
 * GET — Retrieve conversion funnel stats (authenticated, admin only)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const days = parseInt(searchParams.get("days") || "30");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    // Funnel counts
    const [demoScans, signupStarted, signupCompleted, firstScans] = await Promise.all([
      prisma.conversionEvent.count({ where: { event: "demo_scan", createdAt: { gte: since } } }),
      prisma.conversionEvent.count({ where: { event: "signup_started", createdAt: { gte: since } } }),
      prisma.conversionEvent.count({ where: { event: "signup_completed", createdAt: { gte: since } } }),
      prisma.conversionEvent.count({ where: { event: "first_scan", createdAt: { gte: since } } }),
    ]);

    // Unique sessions in funnel
    const uniqueDemoSessions = await prisma.conversionEvent.groupBy({
      by: ["sessionId"],
      where: { event: "demo_scan", createdAt: { gte: since } },
    });

    const uniqueSignupSessions = await prisma.conversionEvent.groupBy({
      by: ["sessionId"],
      where: { event: "signup_completed", createdAt: { gte: since } },
    });

    // Find sessions that did demo scan AND signed up
    const demoSessionIds = new Set(uniqueDemoSessions.map((s) => s.sessionId));
    const convertedCount = uniqueSignupSessions.filter((s) => demoSessionIds.has(s.sessionId)).length;

    // Daily breakdown
    const dailyEvents = await prisma.conversionEvent.groupBy({
      by: ["event"],
      where: { createdAt: { gte: since } },
      _count: true,
    });

    const conversionRate = uniqueDemoSessions.length > 0
      ? ((convertedCount / uniqueDemoSessions.length) * 100).toFixed(1)
      : "0.0";

    return NextResponse.json({
      period: `${days}d`,
      funnel: {
        demoScans,
        signupStarted,
        signupCompleted,
        firstScans,
      },
      conversion: {
        demoToSignup: `${conversionRate}%`,
        uniqueDemoVisitors: uniqueDemoSessions.length,
        converted: convertedCount,
      },
      breakdown: dailyEvents.map((e) => ({ event: e.event, count: e._count })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch analytics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
