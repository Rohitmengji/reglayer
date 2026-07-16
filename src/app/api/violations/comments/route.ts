/**
 * Violation Comments API — team collaboration on accessibility issues.
 *
 * WHY: Teams need to discuss violations, assign responsibility, and track
 *      context around remediation decisions. Currently no way to communicate.
 * WHAT: CRUD for comments on violations with @mentions and timestamps.
 * HOW: Simple comment model linked to violations. Mentions extract @emails
 *      for future notification integration.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { z } from "zod";

const commentSchema = z.object({
  violationId: z.string().min(1),
  content: z.string().min(1).max(5000),
  /** @mentioned user emails — for notification dispatch */
  mentions: z.array(z.string().email()).max(10).default([]),
});

/**
 * GET /api/violations/comments?violationId=X
 * List comments for a violation.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const violationId = searchParams.get("violationId");
  if (!violationId) {
    return NextResponse.json({ error: "violationId required" }, { status: 400 });
  }

  // Verify access via violation → scan → workspace membership
  const violation = await prisma.violation.findUnique({
    where: { id: violationId },
    select: { scan: { select: { workspaceId: true } } },
  });
  if (!violation?.scan?.workspaceId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const perm = await requireWorkspacePermission("scans.run", { workspaceId: violation.scan.workspaceId });
  if (!perm.ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const comments = await prisma.violationComment.findMany({
    where: { violationId },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({
    comments: comments.map((c) => ({
      id: c.id,
      content: c.content,
      mentions: c.mentions,
      author: { name: c.user.name, email: c.user.email },
      createdAt: c.createdAt,
    })),
  });
}

/**
 * POST /api/violations/comments
 * Add a comment to a violation.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { violationId, content, mentions } = parsed.data;

  // Verify workspace access
  const violation = await prisma.violation.findUnique({
    where: { id: violationId },
    select: { scan: { select: { workspaceId: true } } },
  });
  if (!violation?.scan?.workspaceId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const perm = await requireWorkspacePermission("scans.run", { workspaceId: violation.scan.workspaceId });
  if (!perm.ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const comment = await prisma.violationComment.create({
    data: {
      violationId,
      userId: perm.ctx.userId,
      content,
      mentions: mentions,
    },
    include: {
      user: { select: { name: true, email: true } },
    },
  });

  // Audit trail
  await prisma.auditLog.create({
    data: {
      action: "violation.comment_added",
      actor: perm.ctx.userId,
      target: violationId,
      metadata: { commentId: comment.id, mentions },
    },
  }).catch(() => {});

  return NextResponse.json({
    comment: {
      id: comment.id,
      content: comment.content,
      mentions: comment.mentions,
      author: { name: comment.user.name, email: comment.user.email },
      createdAt: comment.createdAt,
    },
  }, { status: 201 });
}
