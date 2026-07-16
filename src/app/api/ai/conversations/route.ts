/**
 * RegLayer — Chat Conversations API
 *
 * GET  /api/ai/conversations         — List user's conversations (latest first)
 * POST /api/ai/conversations         — Create or update a conversation
 * DELETE /api/ai/conversations?id=X   — Archive a conversation (soft delete)
 *
 * WHY: Chat history persisted to DB survives device switches and browser clears.
 * HOW: Conversations are scoped to the authenticated user. Each save writes
 *      the full message array (no partial updates — client is source of truth
 *      during a session, server is durable backup).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { z } from "zod";

const saveSchema = z.object({
  id: z.string().optional(), // Omit to create new, provide to update
  title: z.string().max(200).optional(),
  messages: z.array(z.object({
    id: z.string(),
    role: z.enum(["user", "assistant"]),
    content: z.string().max(50000),
    feedback: z.number().min(-1).max(1).default(0),
  })).max(200),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ conversations: [] });

  // Support search query parameter for conversation search
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  const conversations = await prisma.chatConversation.findMany({
    where: {
      userId: user.id,
      archivedAt: null,
      // Full-text search across title and message content
      ...(query ? {
        OR: [
          { title: { contains: query, mode: "insensitive" as const } },
          { messages: { some: { content: { contains: query, mode: "insensitive" as const } } } },
        ],
      } : {}),
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        select: { role: true, content: true },
        orderBy: { createdAt: "desc" },
        take: 1, // Only the last message for preview
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title || c.messages[0]?.content.slice(0, 60) || "New conversation",
      lastMessage: c.messages[0]?.content.slice(0, 100),
      updatedAt: c.updatedAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { id, title, messages } = parsed.data;

  // Auto-generate title from first user message if not provided
  const effectiveTitle = title || messages.find((m) => m.role === "user")?.content.slice(0, 60) || "New conversation";

  if (id) {
    // Update existing — verify ownership
    const existing = await prisma.chatConversation.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Replace all messages (client is source of truth during session)
    await prisma.$transaction([
      prisma.chatMessage.deleteMany({ where: { conversationId: id } }),
      ...messages.map((m) =>
        prisma.chatMessage.create({
          data: {
            id: m.id,
            role: m.role,
            content: m.content,
            feedback: m.feedback,
            conversationId: id,
          },
        })
      ),
      prisma.chatConversation.update({
        where: { id },
        data: { title: effectiveTitle },
      }),
    ]);

    return NextResponse.json({ id, saved: true });
  }

  // Create new conversation
  const conversation = await prisma.chatConversation.create({
    data: {
      title: effectiveTitle,
      userId: user.id,
      messages: {
        create: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          feedback: m.feedback,
        })),
      },
    },
  });

  return NextResponse.json({ id: conversation.id, saved: true }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Soft-delete: set archivedAt (ownership verified in WHERE)
  const result = await prisma.chatConversation.updateMany({
    where: { id, userId: user.id, archivedAt: null },
    data: { archivedAt: new Date() },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ archived: true });
}
