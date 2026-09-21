import { cache } from "react";
import { prisma } from "@/lib/database/prisma";
import { articles, type ArticleContent } from "@/app/blog/[slug]/content";
import { dbArticleToContent } from "@/lib/blog/articleContent";

export interface PublicArticleSummary {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  readTime: string;
  date: string;
  featured?: boolean;
  lastModified?: string;
}

export const getPublicArticleSummaries = cache(async (): Promise<PublicArticleSummary[]> => {
  const bySlug = new Map<string, PublicArticleSummary>(Object.entries(articles).map(([slug, article], index) => [slug, {
    slug, title: article.title, excerpt: article.excerpt, category: article.category,
    readTime: article.readTime, date: article.date, featured: index < 4,
  }]));
  try {
    const published = await prisma.article.findMany({
      where: { status: "PUBLISHED" },
      select: { slug: true, title: true, excerpt: true, category: true, readTime: true, publishedAt: true, updatedAt: true },
      orderBy: { publishedAt: "desc" },
    });
    const unpublishedSeeds = await prisma.article.findMany({
      where: { slug: { in: Object.keys(articles) }, status: { not: "PUBLISHED" } },
      select: { slug: true },
    });
    for (const article of unpublishedSeeds) bySlug.delete(article.slug);
    for (const article of published) {
      bySlug.set(article.slug, {
        ...bySlug.get(article.slug), slug: article.slug, title: article.title, excerpt: article.excerpt,
        category: article.category, readTime: article.readTime,
        date: (article.publishedAt ?? article.updatedAt).toISOString(), lastModified: article.updatedAt.toISOString(),
      });
    }
  } catch {
    return [...bySlug.values()];
  }
  return [...bySlug.values()];
});

export const getPublicArticle = cache(async (slug: string): Promise<ArticleContent | null> => {
  try {
    const article = await prisma.article.findUnique({ where: { slug } });
    if (article) return article.status === "PUBLISHED" ? dbArticleToContent(article) : null;
  } catch {
    return articles[slug] ?? null;
  }
  return articles[slug] ?? null;
});