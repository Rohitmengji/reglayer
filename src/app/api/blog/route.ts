import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { isContentEditor } from "@/lib/auth/roles";

/**
 * GET /api/blog — List articles (public: published only, admin: all)
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const { searchParams } = new URL(request.url);
  const includeAll = searchParams.get("all") === "true";

  const isAdmin = isContentEditor(session);

  const where = isAdmin && includeAll
    ? {}
    : { status: "PUBLISHED" as const };

  const articles = await prisma.article.findMany({
    where,
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      category: true,
      status: true,
      readTime: true,
      publishedAt: true,
      updatedAt: true,
    },
    orderBy: { publishedAt: "desc" },
  });

  return NextResponse.json({ articles });
}

/**
 * POST /api/blog — Create article (admin only)
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isContentEditor(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.title || !body?.slug) {
    return NextResponse.json({ error: "title and slug required" }, { status: 400 });
  }

  // Check slug uniqueness
  const existing = await prisma.article.findUnique({ where: { slug: body.slug } });
  if (existing) {
    return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
  }

  const article = await prisma.article.create({
    data: {
      slug: body.slug,
      title: body.title,
      excerpt: body.excerpt || "",
      category: body.category || "Technical",
      content: body.content || { sections: [] },
      readTime: body.readTime || "5 min",
      authorId: session.user.id,
      status: body.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
      publishedAt: body.status === "PUBLISHED" ? new Date() : null,
    },
  });

  // Create initial version
  await prisma.articleVersion.create({
    data: {
      articleId: article.id,
      content: article.content as object,
      title: article.title,
      excerpt: article.excerpt,
      editedBy: session.user.id ?? "system",
      editMethod: "manual",
      changeNote: "Initial creation",
    },
  });

  return NextResponse.json({ article }, { status: 201 });
}
