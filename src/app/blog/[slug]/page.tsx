import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock, Calendar, Share2, BookmarkPlus } from "lucide-react";
import { articles, type ArticleContent } from "./content";
import { ArticleEditorWrapper } from "./editor-wrapper";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = articles[slug];
  if (!article) return { title: "Article Not Found — RegLayer Blog" };
  return {
    title: `${article.title} — RegLayer Blog`,
    description: article.excerpt,
  };
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = articles[slug];
  if (!article) notFound();
  return (
    <div className="space-y-6">
      {/* Admin Editor (only renders for admin users) */}
      <ArticleEditorWrapper slug={slug} article={article} />

      {/* Navigation */}
      <header className="border-b border-neutral-100 dark:border-neutral-800/50">
        <div className="mx-auto max-w-4xl px-6 py-3 flex items-center justify-between">
          <Link href="/blog" className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400 hover:text-accent transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Blog
          </Link>
          <div className="flex items-center gap-3">
            <button className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors" aria-label="Share article">
              <Share2 className="h-4 w-4" />
            </button>
            <button className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors" aria-label="Bookmark article">
              <BookmarkPlus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Article */}
      <article className="mx-auto max-w-4xl px-6 pb-8">
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
              {section.paragraphs.map((para, i) => (
                <p key={i} className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed mb-3">
                  {para}
                </p>
              ))}
              {section.stats && (
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {section.stats.map((stat, i) => (
                    <div key={i} className={`rounded-lg ${stat.bg} border ${stat.border} p-3 text-center`}>
                      <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
                      <div className={`text-[10px] font-medium ${stat.labelColor} uppercase`}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              )}
              {section.list && (
                <ul className="mt-3 space-y-1.5 text-sm text-neutral-700 dark:text-neutral-300">
                  {section.list.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
              {section.code && (
                <div className="mt-4 rounded-lg bg-neutral-900 dark:bg-neutral-800 p-4 overflow-x-auto">
                  <pre className="text-xs text-neutral-100 font-mono leading-relaxed whitespace-pre-wrap">{section.code}</pre>
                </div>
              )}
              {section.callout && (
                <div className="mt-4 rounded-lg border border-accent/20 bg-accent/5 dark:bg-accent/10 p-4">
                  <p className="text-xs font-semibold text-accent mb-1">{section.callout.title}</p>
                  <p className="text-sm text-neutral-700 dark:text-neutral-300">{section.callout.body}</p>
                </div>
              )}
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
    </div>
  );
}
