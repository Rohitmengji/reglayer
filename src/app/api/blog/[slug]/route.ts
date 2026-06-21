import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { validateArticleContent } from "@/lib/blog/blockHelpers";
import { isContentEditor } from "@/lib/auth/roles";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

/**
 * GET /api/blog/[slug] — Get single article with version history
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const session = await getServerSession(authOptions);
  const isAdmin = isContentEditor(session);

  const article = await prisma.article.findUnique({
    where: { slug },
    include: {
      versions: isAdmin
        ? { orderBy: { createdAt: "desc" }, take: 20 }
        : false,
    },
  });

  if (!article) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Non-admins can only see published articles
  if (!isAdmin && article.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ article });
}

/**
 * PATCH /api/blog/[slug] — Update article (admin only)
 * 
 * IMPORTANT: This is an additive update. It creates a version snapshot
 * before applying changes, so content is never lost.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const session = await getServerSession(authOptions);
  if (!isContentEditor(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Validate content shape before it's ever persisted (defensive — never store a
  // shape the public renderer can't handle, even though this route is admin-only).
  if (body.content !== undefined) {
    const check = validateArticleContent(body.content);
    if (!check.ok) {
      return NextResponse.json({ error: `Invalid content: ${check.error}` }, { status: 400 });
    }
  }

  const article = await prisma.article.findUnique({ where: { slug } });
  if (!article) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ALWAYS snapshot current state before updating (append-only versioning)
  await prisma.articleVersion.create({
    data: {
      articleId: article.id,
      content: article.content as object,
      title: article.title,
      excerpt: article.excerpt,
      editedBy: session.user.id ?? "system",
      editMethod: body.editMethod || "manual",
      changeNote: body.changeNote || null,
    },
  });

  // Build update data — only update fields that were explicitly provided
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) updateData.title = body.title;
  if (body.excerpt !== undefined) updateData.excerpt = body.excerpt;
  if (body.category !== undefined) updateData.category = body.category;
  if (body.content !== undefined) updateData.content = body.content;
  if (body.readTime !== undefined) updateData.readTime = body.readTime;
  if (body.status !== undefined) {
    updateData.status = body.status;
    if (body.status === "PUBLISHED" && !article.publishedAt) {
      updateData.publishedAt = new Date();
    }
  }

  const updated = await prisma.article.update({
    where: { slug },
    data: updateData,
  });

  return NextResponse.json({ article: updated });
}

/**
 * DELETE /api/blog/[slug] — Archive article (admin only, soft-delete)
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const session = await getServerSession(authOptions);
  if (!isContentEditor(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const article = await prisma.article.findUnique({ where: { slug } });
  if (!article) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Soft delete — archive, don't destroy
  await prisma.article.update({
    where: { slug },
    data: { status: "ARCHIVED" },
  });

  return NextResponse.json({ success: true });
}
