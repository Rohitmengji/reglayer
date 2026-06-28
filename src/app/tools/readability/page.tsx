"use client";

/**
 * RegLayer — public Readability Checker (/tools/readability)
 *
 * Paste content, get Flesch Reading Ease + Flesch–Kincaid grade and whether it
 * clears the WCAG 2.2 AAA "lower secondary" bar (3.1.5). Client-side via the pure
 * engine in @/lib/a11y/readability (no API, no auth).
 */
import { useMemo, useState } from "react";
import { PublicHeader } from "@/components/layout/public-header";
import { Footer } from "@/components/layout/footer";
import { useI18n } from "@/components/i18n-provider";
import { ToolsBackLink } from "@/components/tools/tools-back-link";
import { Check, X } from "lucide-react";
import { analyzeReadability } from "@/lib/a11y/readability";

const SAMPLE =
  "Good content is easy to read. Use short sentences and common words. When you write plainly, more people understand you — including readers with cognitive disabilities.";

export default function ReadabilityToolPage() {
  const { t } = useI18n();
  const [text, setText] = useState(SAMPLE);
  const report = useMemo(() => analyzeReadability(text), [text]);
  const hasText = report.words > 0;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <div className="mb-4"><ToolsBackLink /></div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">{t("tools.readability.title")}</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">{t("tools.readability.subtitle")}</p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={t("tools.readability.placeholder")}
          className="mt-6 w-full rounded-xl border border-neutral-200 dark:border-neutral-700 px-4 py-3 text-sm dark:bg-neutral-800 dark:text-neutral-100 resize-y"
        />

        {hasText && (
          <div className="mt-6 grid gap-4 sm:grid-cols-3" aria-live="polite">
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{t("tools.readability.readingEase")}</p>
              <p className="text-3xl font-black tabular-nums text-neutral-900 dark:text-white">{report.fleschReadingEase}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{report.level}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{t("tools.readability.gradeLevel")}</p>
              <p className="text-3xl font-black tabular-nums text-neutral-900 dark:text-white">{report.fleschKincaidGrade}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{report.words} {t("tools.readability.words")} · {report.sentences} {t("tools.readability.sentences")}</p>
            </div>
            <div className={`rounded-xl border p-5 ${report.meetsWcagAaa ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30" : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"}`}>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">WCAG 2.2 AAA (3.1.5)</p>
              <p className={`mt-1 inline-flex items-center gap-1.5 text-sm font-semibold ${report.meetsWcagAaa ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-400"}`}>
                {report.meetsWcagAaa ? <Check className="h-4 w-4" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}
                {report.meetsWcagAaa ? t("tools.readability.meetsAaa") : t("tools.readability.belowAaa")}
              </p>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
