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
import { applyRateLimit } from "@/lib/rate-limit-middleware";
import { logger } from "@/lib/telemetry/logger";
import {
  collectRatingTransitions,
  recordRatingTransitions,
  type RatingTransition,
} from "@/lib/ai/learning/rating-transitions";
import { bumpConversationVersion } from "@/lib/ai/chat/generation-lease";
import { stripUnstorableChars } from "@/lib/ai/chat/db-safe-text";
import { z } from "zod";

/**
 * The save is an interactive transaction against a remote Postgres, and Prisma's
 * default budget for one is 5s. Production saves were measured at 4-12s and threw
 * `P2028 ... timeout 5000ms, however 6010ms passed` — a 500 that loses the user's
 * transcript. The ceiling below has to sit under the function's own ceiling, or the
 * platform kills the request first and the transaction budget is decorative.
 */
export const maxDuration = 30;
const TX_TIMEOUT_MS = 20_000;
const TX_MAX_WAIT_MS = 5_000;

const saveSchema = z.object({
  id: z.string().max(64).optional(), // Omit to create new, provide to update
  title: z.string().max(200).optional().transform((t) => (t === undefined ? t : stripUnstorableChars(t))),
  // Version the client last saw. Optional so existing clients keep working; when
  // supplied it is enforced, which is what makes concurrent saves safe.
  version: z.number().int().min(0).optional(),
  messages: z.array(z.object({
    id: z.string().min(1).max(64),
    role: z.enum(["user", "assistant"]),
    // Length is validated against what the user actually sent; the strip runs after,
    // so a payload cannot dodge the cap by padding it with characters we remove.
    content: z.string().max(50000).transform(stripUnstorableChars),
    feedback: z.number().min(-1).max(1).default(0),
  })).max(200),
});

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "api");
  if (blocked) return blocked;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ conversations: [] });

  const conversations = await prisma.chatConversation.findMany({
    where: { userId: user.id, archivedAt: null },
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
      lastMessage: c.messages[0]?.content.slice(0, 100) || undefined,
      updatedAt: c.updatedAt,
    })),
  });
}

/**
 * Nothing here may reach the client as an empty body.
 *
 * This route is how a conversation becomes durable, so its failures are exactly the
 * ones the user most needs to hear about — and an unhandled throw produces a 500 with
 * no body, which the client cannot even parse to show a message. It then looks like
 * the save worked. Every exit path below returns JSON.
 */
export async function POST(request: NextRequest) {
  try {
    return await saveConversation(request);
  } catch (err) {
    logger.error("[conversations] save failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Could not save conversation", code: "SAVE_FAILED" },
      { status: 500 },
    );
  }
}

async function saveConversation(request: NextRequest) {
  const blocked = await applyRateLimit(request, "api");
  if (blocked) return blocked;

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

  // Resolve the caller's primary workspace so feedback we forward to the learning
  // system can be found by calculateReliabilityScores(workspaceId) — ChatConversation
  // itself has no workspace context today, so without this every rating would land
  // with workspaceId: null and be invisible to per-workspace quality scoring.
  // Same "earliest-joined membership" convention as requireWorkspacePermission's
  // fallback (src/lib/auth/api-guard.ts) — this route intentionally does not enforce
  // a workspace permission (chat history is personal), it only needs the id for tagging.
  const primaryMembership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    orderBy: { joinedAt: "asc" },
    select: { workspaceId: true },
  });
  const workspaceId = primaryMembership?.workspaceId;

  if (id) {
    // Update existing — verify ownership INSIDE transaction to prevent TOCTOU race.
    // Uses updateMany with userId in WHERE so ownership is atomically checked.
    let ratingTransitions: RatingTransition[] = [];
    let newVersion = 0;

    const txError = await prisma.$transaction(async (tx) => {
      const existing = await tx.chatConversation.findFirst({
        where: { id, userId: user.id },
        select: { id: true },
      });
      if (!existing) {
        throw new Error("NOT_FOUND");
      }

      // Version check BEFORE anything destructive. This save is a delete-all-and-
      // recreate, so a stale write does not merely lose an edit — it replaces the whole
      // message set with an older one. Rejecting here is the difference between "your
      // change was refused" and "another tab's conversation was deleted".
      const guard = await bumpConversationVersion(tx, id, parsed.data.version ?? null);
      if (!guard.ok) {
        throw new Error("STALE_VERSION");
      }
      newVersion = guard.version;

      // Capture prior ratings BEFORE the delete/recreate so we can tell a genuine
      // rating change from an unrelated re-sync. The client debounces and re-sends
      // the whole conversation on every edit; without this diff we would create a
      // duplicate FeedbackEntry on every keystroke-triggered save.
      const previous = await tx.chatMessage.findMany({
        where: { conversationId: id },
        select: { id: true, feedback: true },
      });
      ratingTransitions = collectRatingTransitions(messages, new Map(previous.map((m) => [m.id, m.feedback])));

      await tx.chatMessage.deleteMany({ where: { conversationId: id } });

      // ONE round trip, not one per message.
      //
      // This was a `for` loop awaiting `create()` per message, which is N sequential
      // round trips inside an interactive transaction with a 5s budget. Against a
      // remote Postgres at ~60ms latency that is ~85 messages before it expires — and
      // it did, in production, with P2028 at 5.6-6.1s.
      //
      // The loop was survivable only while saves were rare. Two changes removed that
      // cover: the request schema now accepts 200 messages instead of 50, and the chat
      // runtime persists after every completed turn rather than on a 3s debounce that
      // was skipped mid-stream. Higher frequency and longer conversations turned a
      // latent quadratic-ish cost into a hard failure.
      await tx.chatMessage.createMany({
        data: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          feedback: m.feedback,
          conversationId: id,
        })),
      });
      await tx.chatConversation.update({
        where: { id },
        data: { title: effectiveTitle },
      });
    }, { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS }).catch((err) => {
      if (err instanceof Error && err.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (err instanceof Error && err.message === "STALE_VERSION") {
        // 409 so the client can reload and merge rather than retrying blindly — a
        // blind retry would re-apply the same stale message set.
        return NextResponse.json(
          { error: "Conversation changed elsewhere", code: "STALE_VERSION" },
          { status: 409 },
        );
      }
      // Anything else is a genuine fault — a blown transaction budget, a value the
      // database refuses. Rethrowing produced a bodiless 500; the outer handler now
      // turns it into JSON, and this logs the cause before it gets there.
      logger.error("[conversations] save transaction failed", {
        conversationId: id,
        messageCount: messages.length,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    });

    // The transaction's .catch() returns a NextResponse on a handled failure —
    // it must be returned here, not discarded, or a not-found/not-owned update
    // would incorrectly report `{ saved: true }` to the client.
    if (txError) return txError;

    // Outside the transaction and deliberately not awaited: the learning write is a
    // secondary concern and must never fail or slow down saving the user's chat.
    void recordRatingTransitions(ratingTransitions, user.id, workspaceId);

    return NextResponse.json({ id, saved: true, version: newVersion });
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

  // Rare but possible: the user rates a reply before the first save lands. There is
  // no prior state, so every non-zero rating here is a genuine first transition.
  void recordRatingTransitions(collectRatingTransitions(messages, new Map()), user.id, workspaceId);

  return NextResponse.json({ id: conversation.id, saved: true }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const blocked = await applyRateLimit(request, "api");
  if (blocked) return blocked;

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
