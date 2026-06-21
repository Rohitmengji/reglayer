/**
 * RegLayer — DB Article → display content mapper
 *
 * WHY: The public blog renders the `ArticleContent` shape (with presentation
 *      fields like categoryColor + a formatted date). DB articles store only the
 *      raw fields (category, content JSON, publishedAt, …). This maps a DB row to
 *      the display shape so the SAME renderer serves both static and DB articles —
 *      making the CMS (create + block editor) actually reach readers.
 * WHAT: categoryColorFor(), formatArticleDate(), dbArticleToContent().
 * HOW: Pure (no prisma/React imports) so it's unit-testable and usable anywhere.
 */

import type { ArticleContent, ArticleSection } from "@/app/blog/[slug]/content";

/** Category → pill color classes, matching the seeded static articles. */
const CATEGORY_COLORS: Record<string, string> = {
  WCAG: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400",
  EAA: "bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400",
  Technical: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
  Design: "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400",
  Legal: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400",
  "Section 508": "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400",
  Business: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400",
};
const DEFAULT_CATEGORY_COLOR = "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300";

export function categoryColorFor(category: string): string {
  return CATEGORY_COLORS[category] ?? DEFAULT_CATEGORY_COLOR;
}

/** Format a date (or ISO string) as "May 28, 2026"; empty string if absent/invalid. */
export function formatArticleDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** The subset of a Prisma Article row this mapper needs. */
export interface DbArticleLike {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  content: unknown; // Json: expected { sections: ArticleSection[] }
  readTime: string;
  publishedAt: Date | string | null;
  updatedAt?: Date | string | null;
}

/** Map a DB article row to the display `ArticleContent` shape used by the renderer. */
export function dbArticleToContent(db: DbArticleLike): ArticleContent {
  const raw = db.content as { sections?: unknown } | null;
  const sections: ArticleSection[] = Array.isArray(raw?.sections)
    ? (raw!.sections as ArticleSection[])
    : [];
  return {
    title: db.title,
    excerpt: db.excerpt,
    category: db.category,
    categoryColor: categoryColorFor(db.category),
    readTime: db.readTime || "5 min read",
    date: formatArticleDate(db.publishedAt ?? db.updatedAt ?? null),
    sections,
  };
}
