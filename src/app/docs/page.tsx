"use client";

/**
 * RegLayer — Documentation Hub
 *
 * WHY: Users need a central docs page linking to all documentation sections.
 * WHAT: Card grid linking to: Getting Started, Scanning, Monitoring, Reports, Integrations, Teams.
 * HOW: Client component with i18n. Renders links to /docs/* sub-pages.
 */
import { Rocket, ScanLine, Bell, FileText, Code2, Users, Search } from "lucide-react";
import { useState } from "react";
import { DOC_GUIDES } from "@/lib/docs/content";
import Link from "next/link";
import { PublicHeader } from "@/components/layout/public-header";
import { Footer } from "@/components/layout/footer";
import { useI18n } from "@/components/i18n-provider";

const icons = [Rocket, ScanLine, Bell, FileText, Users, Code2];
const sections = DOC_GUIDES.map((guide, index) => ({ ...guide, icon: icons[index] }));

export default function DocsPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const matches = sections.filter(section => `${section.title} ${section.summary} ${section.sections.map(part => `${part.title} ${part.paragraphs.join(" ")}`).join(" ")}`.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <PublicHeader />

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">{t("docs.title")}</h1>
          <p className="text-neutral-600 dark:text-neutral-300 mt-1">
            {t("docs.subtitle")}
          </p>
          <label className="mt-6 flex max-w-xl items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700">
            <Search className="h-4 w-4 text-neutral-500" aria-hidden="true" />
            <span className="sr-only">Search documentation</span>
            <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search documentation" className="min-w-0 flex-1 bg-transparent py-1 text-sm text-neutral-900 outline-none dark:text-white" />
          </label>
          <p role="status" className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">{matches.length} guides</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map((section) => (
            <Link
              key={section.title}
              href={`/docs/${section.slug}`}
              className="group rounded-lg border border-neutral-200 dark:border-neutral-800 p-5 hover:border-neutral-400 dark:hover:border-neutral-600 transition-colors"
            >
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg mb-3 bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                <section.icon className="h-4.5 w-4.5" />
              </div>
              <h2 className="text-base font-semibold text-neutral-900 dark:text-white mb-1.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{section.title}</h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3 leading-relaxed">
                {section.summary}
              </p>
              <ul className="space-y-1.5">
                {section.quickStart.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[13px] text-neutral-600 dark:text-neutral-300">
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-neutral-300 dark:bg-neutral-600 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-4 text-xs text-neutral-600 dark:text-neutral-400">
                Reviewed <time dateTime={section.reviewedAt}>{section.reviewedAt}</time>
              </div>
            </Link>
          ))}
        </div>
        {matches.length === 0 && <p className="py-8 text-sm text-neutral-600 dark:text-neutral-300">No matching guides. Try a different search.</p>}

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 border-t border-neutral-200 dark:border-neutral-800 py-6">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Need more help?
          </p>
          <div className="flex gap-3">
            <Link
              href="/api-reference"
              className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              API Reference
            </Link>
            <Link
              href="/contact"
              className="rounded-lg bg-neutral-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors"
            >
              Contact Support
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
