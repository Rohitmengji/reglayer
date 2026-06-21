import { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, Calendar, Info, Lightbulb, AlertTriangle, CheckCircle2 } from "lucide-react";
import { articles } from "./content";
import type { CalloutVariant, ArticleContent } from "./content";
import { ArticleEditorWrapper } from "./editor-wrapper";
import { ArticleActions } from "@/components/blog/article-actions";
import { safeUrl, safeVideoEmbed } from "@/lib/blog/blockHelpers";
import { prisma } from "@/lib/database/prisma";
import { dbArticleToContent } from "@/lib/blog/articleContent";

/**
 * Resolve an article for public display: a PUBLISHED DB article wins (so CMS
 * edits + newly-created articles actually appear), otherwise the seeded static
 * article is the fallback, otherwise null → 404. cache() dedupes the DB hit
 * between generateMetadata and the page render. DB failure falls back to static.
 */
const getArticleForDisplay = cache(async (slug: string): Promise<ArticleContent | null> => {
  try {
    const db = await prisma.article.findUnique({ where: { slug } });
    if (db && db.status === "PUBLISHED") return dbArticleToContent(db);
  } catch {
    // DB unavailable — fall through to the static fallback.
  }
  return articles[slug] ?? null;
});

/** Color + icon per callout tone. "note" (and undefined) keep the brand accent. */
const CALLOUT_STYLES: Record<CalloutVariant, { box: string; title: string; Icon: typeof Info }> = {
  note: { box: "border-accent/20 bg-accent/5 dark:bg-accent/10", title: "text-accent", Icon: Info },
  info: { box: "border-blue-200 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-950/30", title: "text-blue-700 dark:text-blue-300", Icon: Info },
  tip: { box: "border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/30", title: "text-emerald-700 dark:text-emerald-300", Icon: Lightbulb },
  warning: { box: "border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/30", title: "text-amber-700 dark:text-amber-300", Icon: AlertTriangle },
  success: { box: "border-green-200 dark:border-green-800/40 bg-green-50 dark:bg-green-950/30", title: "text-green-700 dark:text-green-300", Icon: CheckCircle2 },
};

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleForDisplay(slug);
  if (!article) return { title: "Article Not Found — RegLayer Blog" };
  return {
    title: `${article.title} — RegLayer Blog`,
    description: article.excerpt,
  };
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = await getArticleForDisplay(slug);
  if (!article) notFound();
  return (
    <div className="space-y-6">
      <ArticleEditorWrapper slug={slug} article={article}>
        {/* Navigation */}
        <header className="border-b border-neutral-100 dark:border-neutral-800/50">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link href="/blog" className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400 hover:text-accent transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Blog
          </Link>
          <ArticleActions title={article.title} slug={slug} />
        </div>
      </header>

      {/* Article */}
      <article className="mx-auto max-w-4xl px-4 sm:px-6 pb-8">
        {/* Meta */}
        <div className="flex items-center gap-3 mb-4">
          <span className={`inline-block rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${article.categoryColor}`}>
            {article.category}
          </span>
          <span className="flex items-center gap-1 text-xs text-neutral-400 dark:text-neutral-500">
            <Clock className="h-3 w-3" /> {article.readTime}
          </span>
          <span className="flex items-center gap-1 text-xs text-neutral-400 dark:text-neutral-500">
            <Calendar className="h-3 w-3" /> {article.date}
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white leading-tight">
          {article.title}
        </h1>
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed max-w-3xl">
          {article.excerpt}
        </p>

        {/* Table of Contents */}
        <nav className="mt-6 rounded-xl border border-neutral-100 dark:border-neutral-800 p-4 bg-neutral-50 dark:bg-neutral-900" aria-label="Table of contents">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3">Contents</h2>
          <ol className="space-y-1.5 text-sm text-neutral-700 dark:text-neutral-300 list-decimal list-inside marker:text-neutral-400">
            {article.sections.map((section) => (
              <li key={section.id}><a href={`#${section.id}`} className="hover:text-accent transition-colors">{section.title}</a></li>
            ))}
          </ol>
        </nav>

        {/* Content */}
        <div className="mt-8 space-y-6">
          {article.sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2 className="text-lg font-bold text-neutral-900 dark:text-white mb-3">
                {section.title}
              </h2>
              {(section.paragraphs ?? []).map((para, i) => (
                <p key={i} className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed mb-3">
                  {typeof para === "string" ? para : String(para ?? "")}
                </p>
              ))}
              {Array.isArray(section.stats) && (
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {section.stats.map((stat, i) => (
                    <div key={i} className={`rounded-lg ${stat.bg} border ${stat.border} p-3 text-center`}>
                      <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
                      <div className={`text-[10px] font-medium ${stat.labelColor} uppercase`}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              )}
              {Array.isArray(section.list) && (
                section.ordered ? (
                  <ol className="mt-3 space-y-1.5 text-sm text-neutral-700 dark:text-neutral-300">
                    {section.list.map((item, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[11px] font-semibold text-accent">{i + 1}</span>
                        <span className="pt-0.5">{item}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <ul className="mt-3 space-y-1.5 text-sm text-neutral-700 dark:text-neutral-300">
                    {section.list.map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                )
              )}
              {section.code && (
                <div className="mt-4 rounded-lg bg-neutral-900 dark:bg-neutral-800 p-4 overflow-x-auto">
                  <pre className="text-xs text-neutral-100 font-mono leading-relaxed whitespace-pre-wrap">{section.code}</pre>
                </div>
              )}
              {section.callout && (() => {
                const v = CALLOUT_STYLES[section.callout.variant ?? "note"] ?? CALLOUT_STYLES.note;
                const Icon = v.Icon;
                return (
                  <div className={`mt-4 rounded-lg border p-4 ${v.box}`}>
                    <p className={`flex items-center gap-1.5 text-xs font-semibold mb-1 ${v.title}`}>
                      <Icon className="h-3.5 w-3.5 shrink-0" /> {section.callout.title}
                    </p>
                    <p className="text-sm text-neutral-700 dark:text-neutral-300">{section.callout.body}</p>
                  </div>
                );
              })()}
              {section.image?.url && safeUrl(section.image.url) && (
                <figure className="mt-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- client-supplied external URLs can't use the next/image optimizer (unconfigured domains) */}
                  <img
                    src={safeUrl(section.image.url)}
                    alt={section.image.alt || ""}
                    className="rounded-lg border border-neutral-200 dark:border-neutral-700 max-w-full h-auto"
                  />
                  {section.image.alt && (
                    <figcaption className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">{section.image.alt}</figcaption>
                  )}
                </figure>
              )}
              {section.quote?.text && (
                <blockquote className="mt-4 border-l-4 border-accent pl-4 italic text-neutral-700 dark:text-neutral-300">
                  <p className="text-base">“{section.quote.text}”</p>
                  {section.quote.attribution && (
                    <cite className="mt-1.5 block text-xs not-italic text-neutral-500 dark:text-neutral-400">— {section.quote.attribution}</cite>
                  )}
                </blockquote>
              )}
              {section.button?.label && safeUrl(section.button.url) && (
                <div className="mt-4">
                  <a
                    href={safeUrl(section.button.url)}
                    className="inline-flex items-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
                  >
                    {section.button.label}
                  </a>
                </div>
              )}
              {section.video?.url && safeVideoEmbed(section.video.url) && (
                <figure className="mt-4">
                  <div className="relative w-full overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700" style={{ aspectRatio: "16 / 9" }}>
                    <iframe
                      src={safeVideoEmbed(section.video.url)}
                      title={section.video.title || "Embedded video"}
                      className="absolute inset-0 h-full w-full"
                      loading="lazy"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      referrerPolicy="strict-origin-when-cross-origin"
                    />
                  </div>
                  {section.video.title && (
                    <figcaption className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">{section.video.title}</figcaption>
                  )}
                </figure>
              )}
              {section.table && Array.isArray(section.table.headers) && section.table.headers.length > 0 && Array.isArray(section.table.rows) && (
                <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
                  <table className="w-full min-w-md border-collapse text-sm">
                    <thead>
                      <tr className="bg-neutral-50 dark:bg-neutral-900">
                        {section.table.headers.map((h, i) => (
                          <th key={i} className="border-b border-neutral-200 dark:border-neutral-700 px-3 py-2 text-left font-semibold text-neutral-700 dark:text-neutral-300">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.table.rows.map((row, ri) => (
                        <tr key={ri} className="even:bg-neutral-50/50 dark:even:bg-neutral-900/40">
                          {section.table!.headers.map((_, ci) => (
                            <td key={ci} className="border-b border-neutral-100 dark:border-neutral-800 px-3 py-2 text-neutral-700 dark:text-neutral-300 align-top">
                              {row[ci] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {Array.isArray(section.accordion) && section.accordion.length > 0 && (
                <div className="mt-4 space-y-2">
                  {section.accordion.map((item, i) => (
                    <details key={i} className="group rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-900/40">
                      <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-neutral-800 dark:text-neutral-200 marker:content-none [&::-webkit-details-marker]:hidden">
                        <span>{item.q}</span>
                        <span className="shrink-0 text-neutral-400 transition-transform group-open:rotate-45" aria-hidden>+</span>
                      </summary>
                      <div className="px-4 pb-3 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                        {item.a}
                      </div>
                    </details>
                  ))}
                </div>
              )}
              {section.divider && <hr className="mt-6 border-neutral-200 dark:border-neutral-700" />}
            </section>
          ))}
        </div>

        {/* CTA */}
        {article.cta && (
          <div className="mt-8 rounded-xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-6 text-center">
            <h3 className="text-base font-bold text-neutral-900 dark:text-white mb-2">
              {article.cta.title}
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-5">
              {article.cta.body}
            </p>
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white hover:bg-accent/90 transition-colors shadow-sm"
            >
              Run Free Scan
            </Link>
          </div>
        )}
      </article>
      </ArticleEditorWrapper>
    </div>
  );
}
