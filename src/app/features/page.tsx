"use client";

/**
 * RegLayer — Features Page
 *
 * WHY: Public marketing page showing all platform capabilities.
 * WHAT: 8 feature cards (scanning, monitoring, analytics, reports, API, teams, AI, standards) with icons.
 * HOW: Client component with i18n. Static content with consistent card layout. Links to pricing.
 */

import { Shield, ScanLine, Bell, BarChart3, FileText, Code2, Users, Zap } from "lucide-react";
import Link from "next/link";
import { Footer } from "@/components/layout/footer";
import { useI18n } from "@/components/i18n-provider";

export default function FeaturesPage() {
  const { t } = useI18n();

  const features = [
    { icon: ScanLine, title: t("features.scanning"), description: t("features.scanningDesc") },
    { icon: Bell, title: t("features.monitoring"), description: t("features.monitoringDesc") },
    { icon: BarChart3, title: t("features.analytics"), description: t("features.analyticsDesc") },
    { icon: FileText, title: t("features.reports"), description: t("features.reportsDesc") },
    { icon: Code2, title: t("features.api"), description: t("features.apiDesc") },
    { icon: Users, title: t("features.teams"), description: t("features.teamsDesc") },
    { icon: Zap, title: t("features.ai"), description: t("features.aiDesc") },
    { icon: Shield, title: t("features.standards"), description: t("features.standardsDesc") },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex items-center gap-2 mb-12">
          <Link href="/" className="flex items-center gap-2 text-neutral-900 dark:text-white">
            <Shield className="h-5 w-5" />
            <span className="font-bold">RegLayer</span>
          </Link>
        </div>

        <div className="text-center mb-16">
          <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 dark:text-white mb-4">
            {t("features.title")}
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 max-w-2xl mx-auto">
            {t("features.subtitle")}
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-6 hover:shadow-md transition-shadow"
            >
              <feature.icon className="h-8 w-8 text-neutral-700 dark:text-neutral-300 mb-4" />
              <h3 className="font-semibold text-neutral-900 dark:text-white mb-2">{feature.title}</h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 dark:bg-white px-6 py-3 text-sm font-medium text-white dark:text-neutral-900 hover:opacity-90 transition-opacity"
          >
            {t("features.cta")}
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}
