"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { BookOpen, Scale, Shield, FileText, Gavel, Globe, ArrowRight, Clock, Calendar, Plus } from "lucide-react";

interface Article {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  readTime: string;
  date: string;
  featured?: boolean;
}

const articles: Article[] = [
  {
    slug: "wcag-2-2-whats-new",
    title: "WCAG 2.2: What Changed and Why It Matters",
    excerpt: "Nine new success criteria, three removed. Here's the practical impact on your codebase and compliance posture.",
    category: "WCAG",
    readTime: "12 min",
    date: "2026-05-28",
    featured: true,
  },
  {
    slug: "eaa-compliance-deadline",
    title: "EAA Deadline: What Happens After June 28, 2025",
    excerpt: "The European Accessibility Act is now enforceable. Market surveillance authorities are active. Here's the enforcement reality.",
    category: "EAA",
    readTime: "8 min",
    date: "2026-06-02",
    featured: true,
  },
  {
    slug: "aria-patterns-that-break",
    title: "ARIA Patterns That Break Screen Readers (And What to Use Instead)",
    excerpt: "Common ARIA anti-patterns found in 10,000 scans. Role conflicts, missing states, and the tabindex trap.",
    category: "Technical",
    readTime: "15 min",
    date: "2026-06-08",
    featured: true,
  },
  {
    slug: "color-contrast-beyond-ratios",
    title: "Color Contrast Beyond 4.5:1 — APCA and the Future of Readability",
    excerpt: "Why WCAG contrast ratios are flawed, how APCA works, and practical dark mode design that actually meets perceptual requirements.",
    category: "Design",
    readTime: "10 min",
    date: "2026-06-05",
    featured: true,
  },
  {
    slug: "ada-title-iii-2026-update",
    title: "ADA Title III Digital Lawsuits in 2026: A Data-Driven Analysis",
    excerpt: "Filing trends, plaintiff strategies, settlement amounts, and how proactive scanning changes your legal risk profile.",
    category: "Legal",
    readTime: "14 min",
    date: "2026-05-20",
  },
  {
    slug: "automated-vs-manual-testing",
    title: "Automated vs. Manual Accessibility Testing: The 70/30 Framework",
    excerpt: "Automated tools catch ~57% of WCAG issues. Here's a systematic approach to cover the remaining 43% without burning QA budgets.",
    category: "Technical",
    readTime: "11 min",
    date: "2026-05-15",
  },
  {
    slug: "keyboard-navigation-deep-dive",
    title: "Keyboard Navigation Done Right: Focus Management in SPAs",
    excerpt: "Client-side routing breaks focus. Here's how to implement proper focus management in React, Next.js, and Vue applications.",
    category: "Technical",
    readTime: "13 min",
    date: "2026-05-10",
  },
  {
    slug: "vpat-documentation-guide",
    title: "Writing a VPAT That Actually Helps: A Technical Author's Guide",
    excerpt: "Most VPATs are useless marketing documents. Here's how to create one that procurement teams trust and engineers reference.",
    category: "Section 508",
    readTime: "9 min",
    date: "2026-05-05",
  },
  {
    slug: "remediation-roi-calculator",
    title: "Quantifying Remediation ROI: Cost of Non-Compliance vs. Fixing",
    excerpt: "Average ADA settlement is $35,000. Average critical fix takes 4 hours. The math is overwhelming — here are the numbers.",
    category: "Business",
    readTime: "7 min",
    date: "2026-04-28",
  },
  {
    slug: "cognitive-accessibility-2-2",
    title: "Cognitive Accessibility in WCAG 2.2: Beyond Perceivable and Operable",
    excerpt: "New criteria for focus appearance, dragging movements, and consistent help. How to implement without breaking existing UX.",
    category: "WCAG",
    readTime: "12 min",
    date: "2026-04-22",
  },
];

const categories = [
  { slug: "wcag", label: "WCAG", icon: Shield, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/40" },
  { slug: "eaa", label: "EAA", icon: Globe, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/40" },
  { slug: "legal", label: "Legal", icon: Gavel, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/40" },
  { slug: "technical", label: "Technical", icon: FileText, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/40" },
  { slug: "section-508", label: "Section 508", icon: Scale, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-950/40" },
];

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function BlogPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.isMasterAdmin || session?.user?.role === "admin" || session?.user?.role === "owner";
  const featured = articles.filter((a) => a.featured);
  const rest = articles.filter((a) => !a.featured);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="border-b border-neutral-100 dark:border-neutral-800/50">
        <div className="mx-auto max-w-5xl px-6 pb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-accent" />
              <span className="text-xs font-semibold uppercase tracking-wider text-accent">Blog</span>
            </div>
            {isAdmin && (
              <Link
                href="/blog/create"
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 transition-colors"
              >
                <Plus className="h-3 w-3" /> New Article
              </Link>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white leading-tight max-w-2xl">
            Accessibility compliance, explained for practitioners.
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300 max-w-xl leading-relaxed">
            No marketing fluff. Deep technical content on WCAG, ADA, EAA, Section 508, and the legal landscape — written by engineers and compliance specialists.
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
      <section className="mx-auto max-w-5xl px-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-4">
          Featured
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {featured.map((article) => (
            <Link
              key={article.slug}
              href={`/blog/${article.slug}`}
              className="group rounded-xl border border-neutral-100 dark:border-neutral-800 p-6 transition-all hover:border-neutral-200 dark:hover:border-neutral-700 hover:shadow-sm"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-block rounded-md bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                  {article.category}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-neutral-400 dark:text-neutral-500">
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
                <span className="flex items-center gap-1 text-[11px] text-neutral-400 dark:text-neutral-500">
                  <Calendar className="h-3 w-3" />
                  {formatDate(article.date)}
                </span>
                <span className="flex items-center gap-1 text-xs font-medium text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                  Read <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* All Articles */}
      <section className="mx-auto max-w-5xl px-6 pt-2 border-t border-neutral-100 dark:border-neutral-800/50">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-4">
          All Articles
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
                  <span className="text-[11px] text-neutral-400 dark:text-neutral-500">{formatDate(article.date)}</span>
                </div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white group-hover:text-accent transition-colors">
                  {article.title}
                </h3>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1">
                  {article.excerpt}
                </p>
              </div>
              <span className="shrink-0 mt-3 flex items-center gap-1 text-[11px] text-neutral-400">
                <Clock className="h-3 w-3" />{article.readTime}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Newsletter CTA */}
      <section className="mx-auto max-w-5xl px-6">
        <div className="rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 p-8 text-center">
          <h2 className="text-base font-bold text-neutral-900 dark:text-white mb-2">
            Stay ahead of regulatory changes.
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6 max-w-md mx-auto">
            Get monthly deep dives on accessibility law, technical guides, and enforcement updates. No spam.
          </p>
          <div className="flex items-center justify-center gap-2 max-w-sm mx-auto">
            <input
              type="email"
              placeholder="your@email.com"
              className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-2.5 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 outline-none focus:ring-2 focus:ring-accent/50"
              aria-label="Email address"
            />
            <button className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent/90 transition-colors shadow-sm">
              Subscribe
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
