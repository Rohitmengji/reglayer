/**
 * RegLayer — Notifications Inbox API
 *
 * WHY: Users need to see in-app notifications and mark them as read.
 * WHAT: GET returns latest 50 notifications + unread count; PATCH marks notifications as read.
 * HOW: Authenticated via session, scoped to userId, ordered by createdAt DESC.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { z } from "zod";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        link: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({
      where: { userId: user.id, readAt: null },
    }),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}

const markReadSchema = z.object({
  notificationIds: z.array(z.string()).min(1).max(50),
});

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = markReadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  // Only mark notifications owned by this user
  const { count } = await prisma.notification.updateMany({
    where: {
      id: { in: parsed.data.notificationIds },
      userId: user.id,
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ marked: count });
}
