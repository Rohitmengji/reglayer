"use client";

/**
 * RegLayer — Enterprise pricing section
 *
 * WHY: The Enterprise card can only fit a list. Procurement, security, and legal
 *      reviewers need the "why / who / what / why-trust" story before they
 *      contact sales. This section answers those without visual clutter.
 * WHAT: Eyebrow + positioning, a why/who two-up, feature value grouped by
 *       category (each with a plain-English explanation and honest
 *       available/coming-soon status), verifiable trust signals, and a single
 *       strong Contact Sales CTA.
 * HOW: Pure presentation driven by the typed model in lib/pricing/enterprise.
 *      Semantic headings (h2 → h3 → h4), decorative icons hidden from AT,
 *      status conveyed by a visible Badge (not colour alone). Motion is handled
 *      globally via prefers-reduced-motion, so no bespoke animation here.
 */

import Link from "next/link";
import { Globe, ShieldCheck, Clock, ArrowRight } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { enterpriseFeaturesByCategory, ENTERPRISE_PRICE } from "@/lib/pricing/enterprise";

const CONTACT_HREF = "/contact?subject=enterprise";

export function EnterpriseSection() {
  const { t } = useI18n();
  const groups = enterpriseFeaturesByCategory();

  const trustSignals = [
    { icon: Globe, title: t("pricing.ent.trustEuTitle"), body: t("pricing.ent.trustEuBody") },
    { icon: ShieldCheck, title: t("pricing.ent.trustAuditTitle"), body: t("pricing.ent.trustAuditBody") },
    { icon: Clock, title: t("pricing.ent.trustSlaTitle"), body: t("pricing.ent.trustSlaBody") },
  ];

  return (
    <section
      id="enterprise"
      aria-labelledby="enterprise-heading"
      className="mt-24 scroll-mt-24 border-t border-neutral-200 dark:border-neutral-800 pt-16"
    >
      {/* Positioning */}
      <div className="max-w-3xl">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
          {t("pricing.ent.eyebrow")}
        </p>
        <h2
          id="enterprise-heading"
          className="mt-4 text-3xl font-black tracking-tight text-neutral-900 dark:text-white sm:text-4xl"
        >
          {t("pricing.ent.sectionTitle")}
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-neutral-600 dark:text-neutral-300">
          {t("pricing.ent.sectionSubtitle")}
        </p>
      </div>

      {/* Why / Who */}
      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {t("pricing.ent.whyTitle")}
          </h3>
          <p className="mt-2 text-base leading-relaxed text-neutral-700 dark:text-neutral-200">
            {t("pricing.ent.whyBody")}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {t("pricing.ent.whoTitle")}
          </h3>
          <p className="mt-2 text-base leading-relaxed text-neutral-700 dark:text-neutral-200">
            {t("pricing.ent.whoBody")}
          </p>
        </div>
      </div>

      {/* Feature value, grouped by category */}
      <h3 className="mt-14 text-xl font-bold text-neutral-900 dark:text-white">
        {t("pricing.ent.valueTitle")}
      </h3>
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map(({ category, features }) => {
          const CatIcon = category.icon;
          return (
            <div
              key={category.id}
              className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6"
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                  aria-hidden="true"
                >
                  <CatIcon className="h-5 w-5" />
                </span>
                <h4 className="text-base font-semibold text-neutral-900 dark:text-white">
                  {t(category.titleKey)}
                </h4>
              </div>
              <ul className="mt-4 space-y-4">
                {features.map((feature) => {
                  const Icon = feature.icon;
                  const comingSoon = feature.status === "coming-soon";
                  return (
                    <li key={feature.id} className="flex items-start gap-3">
                      <Icon
                        className={
                          comingSoon
                            ? "mt-0.5 h-4 w-4 shrink-0 text-neutral-400 dark:text-neutral-500"
                            : "mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400"
                        }
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-sm font-medium text-neutral-900 dark:text-white">
                            {t(feature.labelKey)}
                          </span>
                          {comingSoon && (
                            <Badge variant="secondary" className="font-medium">
                              {t("pricing.comingSoon")}
                            </Badge>
                          )}
                        </div>
                        {feature.descKey && (
                          <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                            {t(feature.descKey)}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Trust signals */}
      <h3 className="mt-14 text-xl font-bold text-neutral-900 dark:text-white">
        {t("pricing.ent.trustTitle")}
      </h3>
      <div className="mt-6 grid gap-5 sm:grid-cols-3">
        {trustSignals.map((signal) => {
          const Icon = signal.icon;
          return (
            <div
              key={signal.title}
              className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6"
            >
              <span
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200"
                aria-hidden="true"
              >
                <Icon className="h-5 w-5" />
              </span>
              <h4 className="mt-4 text-base font-semibold text-neutral-900 dark:text-white">
                {signal.title}
              </h4>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                {signal.body}
              </p>
            </div>
          );
        })}
      </div>

      {/* Contact sales */}
      <div className="mt-12 rounded-2xl bg-neutral-900 dark:bg-white p-8 sm:p-12">
        <div className="mx-auto max-w-2xl text-center">
          <h3 className="text-2xl font-bold text-white dark:text-neutral-900">
            {t("pricing.ent.ctaTitle")}
          </h3>
          <p className="mt-3 text-base leading-relaxed text-neutral-300 dark:text-neutral-600">
            {t("pricing.ent.ctaBody")}
          </p>
          <p className="mt-4 text-sm font-medium text-neutral-400 dark:text-neutral-500">
            {t("pricing.enterprisePriceNote", { total: ENTERPRISE_PRICE.annual * 12 })}
          </p>
          <div className="mt-6 flex justify-center">
            <Link
              href={CONTACT_HREF}
              className="inline-flex items-center gap-2 rounded-lg bg-white dark:bg-neutral-900 px-6 py-3 text-sm font-semibold text-neutral-900 dark:text-white transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white dark:focus-visible:ring-neutral-900 focus-visible:ring-offset-neutral-900 dark:focus-visible:ring-offset-white"
            >
              {t("pricing.enterpriseCta")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
