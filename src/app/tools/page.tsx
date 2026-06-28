"use client";

/**
 * RegLayer — public Accessibility Tools hub (/tools)
 *
 * Index of the free, instant, client-side WCAG tools. No signup.
 */
import Link from "next/link";
import { PublicHeader } from "@/components/layout/public-header";
import { Footer } from "@/components/layout/footer";
import { useI18n } from "@/components/i18n-provider";
import { Contrast, Eye, BookOpen, ArrowRight } from "lucide-react";

export default function ToolsHubPage() {
  const { t } = useI18n();

  const tools = [
    { href: "/tools/contrast", icon: Contrast, title: t("tools.contrast.title"), desc: t("tools.contrast.cardDesc") },
    { href: "/tools/color-vision", icon: Eye, title: t("tools.colorVision.title"), desc: t("tools.colorVision.cardDesc") },
    { href: "/tools/readability", icon: BookOpen, title: t("tools.readability.title"), desc: t("tools.readability.cardDesc") },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <PublicHeader />
      <main className="mx-auto max-w-4xl px-4 py-12 sm:py-16">
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">{t("tools.hub.title")}</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">{t("tools.hub.subtitle")}</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="group flex flex-col rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-6 transition-colors hover:border-neutral-300 dark:hover:border-neutral-600"
            >
              <tool.icon className="h-6 w-6 text-neutral-900 dark:text-white" aria-hidden="true" />
              <p className="mt-3 text-base font-semibold text-neutral-900 dark:text-white">{tool.title}</p>
              <p className="mt-1 flex-1 text-sm text-neutral-500 dark:text-neutral-400">{tool.desc}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-neutral-900 dark:text-white">
                {t("tools.hub.open")} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
