import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { getOrCreateWorkspace } from "@/lib/database/workspace";

/**
 * GET /api/notifications — Fetch current user's notification preferences from DB
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Ensure user + workspace exist
  const user = await prisma.user.upsert({
    where: { email: session.user.email },
    update: {},
    create: { email: session.user.email, name: (session.user as { name?: string }).name || null },
  });
  await getOrCreateWorkspace(user.id, user.email);

  // Get or create preferences
  const prefs = await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  return NextResponse.json({
    preferences: {
      scanComplete: prefs.scanComplete,
      weeklyDigest: prefs.weeklyDigest,
      newViolations: prefs.newViolations,
      complianceAlerts: prefs.complianceAlerts,
      teamActivity: prefs.teamActivity,
      scheduledReports: prefs.scheduledReports,
    },
  });
}

/**
 * PUT /api/notifications — Update notification preferences
 */
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.upsert({
    where: { email: session.user.email },
    update: {},
    create: { email: session.user.email, name: (session.user as { name?: string }).name || null },
  });

  const body = await request.json();
  const incoming = body.preferences || {};

  // Only allow valid boolean fields
  const validKeys = ["scanComplete", "weeklyDigest", "newViolations", "complianceAlerts", "teamActivity", "scheduledReports"];
  const updateData: Record<string, boolean> = {};
  for (const key of validKeys) {
    if (typeof incoming[key] === "boolean") {
      updateData[key] = incoming[key];
    }
  }

  const prefs = await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    update: updateData,
    create: { userId: user.id, ...updateData },
  });

  return NextResponse.json({
    preferences: {
      scanComplete: prefs.scanComplete,
      weeklyDigest: prefs.weeklyDigest,
      newViolations: prefs.newViolations,
      complianceAlerts: prefs.complianceAlerts,
      teamActivity: prefs.teamActivity,
      scheduledReports: prefs.scheduledReports,
    },
  });
}

/**
 * POST /api/notifications — Send a test notification email
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { isEmailConfigured, sendScanCompleteEmail } = await import("@/lib/email/service");

  if (!isEmailConfigured()) {
    return NextResponse.json({
      error: "Email not configured. Add SMTP_HOST, SMTP_USER, SMTP_PASS to your environment variables. For Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USER=your@gmail.com, SMTP_PASS=your-app-password",
    }, { status: 400 });
  }

  const result = await sendScanCompleteEmail(session.user.email, {
    url: "https://example.com",
    score: 85,
    violations: 12,
    critical: 2,
    reportUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://reglayer.vercel.app"}/dashboard`,
  });

  if (result.success) {
    return NextResponse.json({ message: "Test email sent", id: result.id });
  } else {
    return NextResponse.json({ error: result.error || "Failed to send" }, { status: 500 });
  }
}
