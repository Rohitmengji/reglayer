"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { BookOpen, Scale, Shield, FileText, Gavel, Globe, ArrowRight, Clock, Calendar, Plus } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { isContentEditor } from "@/lib/auth/roles";
import type { PublicArticleSummary } from "@/lib/blog/public-articles";

// Category chips render at 12px on a tinted `-50` background. At that size WCAG 1.4.3 (AA)
// requires 4.5:1, and the `-600` shades fail it (amber 3.08, emerald 3.46, rose 4.12).
// The `-700` shades all clear 4.5:1 on their matching `-50` background. Verified with axe.
const categories = [
  { slug: "wcag", label: "WCAG", icon: Shield, color: "text-blue-700 dark:text-blue-300", bg: "bg-blue-50 dark:bg-blue-950/40" },
  { slug: "eaa", label: "EAA", icon: Globe, color: "text-violet-700 dark:text-violet-300", bg: "bg-violet-50 dark:bg-violet-950/40" },
  { slug: "legal", label: "Legal", icon: Gavel, color: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-950/40" },
  { slug: "technical", label: "Technical", icon: FileText, color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-950/40" },
  { slug: "section-508", label: "Section 508", icon: Scale, color: "text-rose-700 dark:text-rose-300", bg: "bg-rose-50 dark:bg-rose-950/40" },
];

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function BlogList({ articles }: { articles: PublicArticleSummary[] }) {
  const { t } = useI18n();
  const { data: session } = useSession();
  const isAdmin = isContentEditor(session);

  const featured = articles.filter((a) => a.featured);
  const rest = articles.filter((a) => !a.featured);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="border-b border-neutral-100 dark:border-neutral-800/50">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 pb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-accent" />
              <span className="text-xs font-semibold uppercase tracking-wider text-accent">{t("blog.title")}</span>
            </div>
            {isAdmin && (
              <Link
                href="/blog/create"
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 transition-colors"
              >
                <Plus className="h-3 w-3" /> {t("blog.newArticle")}
              </Link>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white leading-tight max-w-2xl">
            {t("blog.heading")}
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300 max-w-xl leading-relaxed">
            {t("blog.subtitle")}
          </p>

          {/* Category pills */}
          <div className="mt-5 flex flex-wrap gap-2">
            {categories.map((cat) => (
              <span
                key={cat.slug}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${cat.bg} ${cat.color}`}
              >
                <cat.icon className="h-3 w-3" />
                {cat.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Articles */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-4">
          {t("blog.featured")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {featured.map((article) => (
            <Link
              key={article.slug}
              href={`/blog/${article.slug}`}
              className="group rounded-xl border border-neutral-100 dark:border-neutral-800 p-6 transition-all hover:border-neutral-200 dark:hover:border-neutral-700 hover:shadow-sm"
            >
              <div className="flex items-center gap-2 mb-3">
                {/* bg-accent/10 (#e9effd) under text-accent (#2563eb) measures 4.48:1 — just under
                    the 4.5:1 AA floor at 10px. A /5 tint lifts it clear while keeping the token
                    themeable for agency branding. */}
                <span className="inline-block rounded-md bg-accent/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                  {article.category}
                </span>
                {/* neutral-400 (#a1a1a1) on white measures 2.58:1 — a clear WCAG 1.4.3 failure
                    for 11px metadata. neutral-600 is 7.60:1. */}
                <span className="flex items-center gap-1 text-[11px] text-neutral-600 dark:text-neutral-400">
                  <Clock className="h-3 w-3" />
                  {article.readTime}
                </span>
              </div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-white group-hover:text-accent transition-colors leading-snug">
                {article.title}
              </h3>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed line-clamp-2">
                {article.excerpt}
              </p>
              <div className="mt-4 flex items-center justify-between">
                <span className="flex items-center gap-1 text-[11px] text-neutral-600 dark:text-neutral-400">
                  <Calendar className="h-3 w-3" />
                  {formatDate(article.date)}
                </span>
                <span className="flex items-center gap-1 text-xs font-medium text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                  {t("blog.read")} <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* All Articles */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pt-2 border-t border-neutral-100 dark:border-neutral-800/50">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-4">
          {t("blog.allArticles")}
        </h2>
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {rest.map((article) => (
            <Link
              key={article.slug}
              href={`/blog/${article.slug}`}
              className="group flex items-start gap-4 py-5 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900/50 -mx-4 px-4 rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-block rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:text-neutral-400 uppercase">
                    {article.category}
                  </span>
                  <span className="text-[11px] text-neutral-600 dark:text-neutral-400">{formatDate(article.date)}</span>
                </div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white group-hover:text-accent transition-colors">
                  {article.title}
                </h3>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1">
                  {article.excerpt}
                </p>
              </div>
              <span className="shrink-0 mt-3 flex items-center gap-1 text-[11px] text-neutral-600 dark:text-neutral-400">
                <Clock className="h-3 w-3" />{article.readTime}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
