/**
 * RegLayer — Cross-Conversation Search API
 *
 * POST /api/ai/conversations/search — Search across ALL conversations in workspace
 *
 * WHY: "What decisions did we make about auth?" should search every conversation.
 * HOW: Full-text search on ChatMessage content with context highlighting.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { prisma } from "@/lib/database/prisma";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { z } from "zod";

const searchSchema = z.object({
  query: z.string().min(2).max(500),
  limit: z.number().int().min(1).max(50).default(20),
  role: z.enum(["user", "assistant", "all"]).default("all"),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(session.user.email, RATE_LIMITS.api, "ai-conv-search");
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  // Cross-conversation search is read-only within the caller's workspace —
  // scoped to `scans.view` so MEMBER/VIEWER can search their own history.
  const perm = await requireWorkspacePermission("scans.view");
  if (!perm.ok) return perm.response;
  if (!perm.ctx.workspaceId) return NextResponse.json({ results: [] });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = searchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { query, limit, role } = parsed.data;

  const roleFilter = role === "all" ? {} : { role };

  const messages = await prisma.chatMessage.findMany({
    where: {
      conversation: { workspaceId: perm.ctx.workspaceId },
      content: { contains: query, mode: "insensitive" },
      ...roleFilter,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
      conversationId: true,
      conversation: {
        select: { title: true },
      },
    },
  });

  const results = messages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content.length > 300 ? msg.content.slice(0, 300) + "..." : msg.content,
    conversationId: msg.conversationId,
    conversationTitle: msg.conversation?.title ?? "Untitled",
    createdAt: msg.createdAt.toISOString(),
    highlight: extractHighlight(msg.content, query),
  }));

  return NextResponse.json({ results, total: results.length, query });
}

function extractHighlight(content: string, query: string): string {
  const lower = content.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return content.slice(0, 150);

  const start = Math.max(0, idx - 50);
  const end = Math.min(content.length, idx + query.length + 50);
  let highlight = content.slice(start, end);
  if (start > 0) highlight = "..." + highlight;
  if (end < content.length) highlight = highlight + "...";
  return highlight;
}
