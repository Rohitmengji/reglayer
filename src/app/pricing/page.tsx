"use client";

/**
 * RegLayer — Pricing Page
 *
 * WHY: Convert free users to paid plans; give procurement/security buyers a real
 *      Enterprise story, not a generic card.
 * WHAT: 3-tier cards (Free/Pro/Enterprise) with a monthly/annual toggle, an
 *       honest Enterprise feature list (status-driven "coming soon", tooltips on
 *       jargon), and an expanded Enterprise section below.
 * HOW: Client component for the billing toggle. Displayed allowances derive from
 *       the enforced backend limits (PLAN_LIMITS) and the Enterprise feature
 *       model, so pricing can never advertise more than a user actually gets.
 */

import { useState } from "react";
import Link from "next/link";
import {
  Shield,
  Check,
  ArrowRight,
  Building2,
  Scan,
  FileText,
  BarChart3,
  Users,
  Globe,
  Zap,
  Webhook,
  Lock,
} from "lucide-react";
import { Footer } from "@/components/layout/footer";
import { useI18n } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { InfoHint } from "@/components/ui/info-hint";
import { PLAN_LIMITS } from "@/lib/credits/plan-limits";
import { ENTERPRISE_FEATURES, ENTERPRISE_PRICE } from "@/lib/pricing/enterprise";
import { EnterpriseSection } from "@/components/pricing/enterprise-section";
import type { TranslationKey } from "@/lib/i18n/translations";

// Single source of truth: the displayed scan allowance is DERIVED from the
// enforced backend limit, so pricing can never advertise more than users get.
const scansLabel = (n: number) => (n === -1 ? "Unlimited scans" : `${n} scans per month`);

type SimpleFeature = { text: string; icon: typeof Check };

interface CardPlan {
  id: "free" | "pro" | "enterprise";
  nameKey: TranslationKey;
  descKey: TranslationKey;
  ctaKey: TranslationKey;
  ctaHref: string;
  ctaVariant: "primary" | "outline";
  price: { monthly: number; annual: number };
  popular?: boolean;
  /** Free/Pro list inline; Enterprise renders from the typed feature model. */
  features?: SimpleFeature[];
}

const plans: CardPlan[] = [
  {
    id: "free",
    nameKey: "pricing.freePlanName",
    descKey: "pricing.freePlanDesc",
    ctaKey: "pricing.freeCta",
    ctaHref: "/auth/login",
    ctaVariant: "outline",
    price: { monthly: 0, annual: 0 },
    features: [
      { text: scansLabel(PLAN_LIMITS.FREE.scansPerMonth), icon: Scan },
      { text: "WCAG 2.1 Level AA checks", icon: Check },
      { text: "Basic compliance score", icon: BarChart3 },
      { text: "Public share links", icon: FileText },
      { text: `${PLAN_LIMITS.FREE.teamMembers} team members`, icon: Users },
      { text: "Community support", icon: Users },
    ],
  },
  {
    id: "pro",
    nameKey: "pricing.proPlanName",
    descKey: "pricing.proPlanDesc",
    ctaKey: "pricing.proCta",
    ctaHref: "/auth/login",
    ctaVariant: "primary",
    price: { monthly: 49, annual: 39 },
    popular: true,
    features: [
      { text: scansLabel(PLAN_LIMITS.PRO.scansPerMonth), icon: Scan },
      { text: "EN 301 549 compliance", icon: Check },
      { text: "Accessibility Statement generator", icon: FileText },
      { text: "Compliance certificates", icon: Lock },
      { text: `Multi-page crawling (${PLAN_LIMITS.PRO.pagesPerScan} pages)`, icon: Globe },
      { text: "AI-powered fix suggestions", icon: Zap },
      { text: "Scheduled monitoring", icon: BarChart3 },
      { text: "Webhook integrations", icon: Webhook },
      { text: `${PLAN_LIMITS.PRO.teamMembers} team members`, icon: Users },
      { text: "Priority email support", icon: Check },
    ],
  },
  {
    id: "enterprise",
    nameKey: "pricing.enterprisePlanName",
    descKey: "pricing.enterprisePlanDesc",
    ctaKey: "pricing.enterpriseCta",
    ctaHref: "/contact?subject=enterprise",
    ctaVariant: "outline",
    price: ENTERPRISE_PRICE,
    // Enterprise features render from the typed model (status + tooltips).
  },
];

export default function PricingPage() {
  const { t } = useI18n();
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      {/* Header */}
      <header className="border-b border-neutral-100 dark:border-neutral-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-4">
          <Link href="/" className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 dark:focus-visible:ring-white">
            <Shield className="h-6 w-6 text-neutral-900 dark:text-white" aria-hidden="true" />
            <span className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">RegLayer</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="rounded-md px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 dark:focus-visible:ring-white"
            >
              {t("pricing.signIn")}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-800 px-3 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 mb-4">
            <Building2 className="h-3 w-3" aria-hidden="true" />
            {t("pricing.badge")}
          </div>
          <h1 className="text-4xl font-black text-neutral-900 dark:text-white sm:text-5xl">
            {t("pricing.title")}
          </h1>
          <p className="mt-4 text-lg text-neutral-500 dark:text-neutral-400 max-w-2xl mx-auto">
            {t("pricing.subtitle")}
          </p>

          {/* Billing Toggle */}
          <div
            className="mt-8 inline-flex items-center gap-3 rounded-full bg-neutral-100 dark:bg-neutral-800 p-1"
            role="group"
            aria-label={`${t("pricing.monthly")} / ${t("pricing.annual")}`}
          >
            <button
              type="button"
              onClick={() => setBilling("monthly")}
              aria-pressed={billing === "monthly"}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 dark:focus-visible:ring-white ${
                billing === "monthly"
                  ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm"
                  : "text-neutral-500 dark:text-neutral-400"
              }`}
            >
              {t("pricing.monthly")}
            </button>
            <button
              type="button"
              onClick={() => setBilling("annual")}
              aria-pressed={billing === "annual"}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 dark:focus-visible:ring-white ${
                billing === "annual"
                  ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm"
                  : "text-neutral-500 dark:text-neutral-400"
              }`}
            >
              {t("pricing.annual")}
              <span className="ml-1.5 rounded-full bg-green-100 dark:bg-green-900/50 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:text-green-300">
                {t("pricing.save20")}
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 items-start">
          {plans.map((plan) => {
            const price = billing === "annual" ? plan.price.annual : plan.price.monthly;
            const isEnterprise = plan.id === "enterprise";
            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border p-6 lg:p-8 flex flex-col ${
                  plan.popular
                    ? "border-neutral-900 dark:border-white shadow-xl md:scale-[1.02]"
                    : "border-neutral-200 dark:border-neutral-700"
                } bg-white dark:bg-neutral-900`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-neutral-900 dark:bg-white px-3 py-1 text-xs font-semibold text-white dark:text-neutral-900">
                    {t("pricing.mostPopular")}
                  </div>
                )}

                <div className="mb-6">
                  <h2 className="text-lg font-bold text-neutral-900 dark:text-white">{t(plan.nameKey)}</h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{t(plan.descKey)}</p>
                </div>

                <div className="mb-6">
                  {price === 0 ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-black text-neutral-900 dark:text-white">{t("pricing.free")}</span>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-black text-neutral-900 dark:text-white">€{price}</span>
                      <span className="text-sm text-neutral-500 dark:text-neutral-400">{t("pricing.perMonth")}</span>
                    </div>
                  )}
                  {billing === "annual" && price > 0 && (
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                      {t("pricing.billedAnnually")} (€{price * 12}/year)
                    </p>
                  )}
                  {isEnterprise && (
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                      {t("pricing.enterpriseCustomPricing")}
                    </p>
                  )}
                </div>

                <Link
                  href={plan.ctaHref}
                  className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium text-center transition-colors mb-3 block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900 ${
                    plan.ctaVariant === "primary"
                      ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 focus-visible:ring-neutral-900 dark:focus-visible:ring-white"
                      : "border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 focus-visible:ring-neutral-900 dark:focus-visible:ring-white"
                  }`}
                >
                  {t(plan.ctaKey)}
                  {plan.ctaVariant === "primary" && <ArrowRight className="inline h-4 w-4 ml-1" aria-hidden="true" />}
                </Link>

                {isEnterprise && (
                  <a
                    href="#enterprise"
                    className="mb-6 block text-center text-xs font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 dark:focus-visible:ring-white"
                  >
                    {t("pricing.ent.seeIncluded")}
                  </a>
                )}

                {/* Features */}
                {isEnterprise ? (
                  <ul className="space-y-3 flex-1">
                    {ENTERPRISE_FEATURES.map((feature) => {
                      const Icon = feature.icon;
                      const comingSoon = feature.status === "coming-soon";
                      return (
                        <li key={feature.id} className="flex items-start gap-2.5">
                          <Icon
                            className={`mt-0.5 h-4 w-4 shrink-0 ${
                              comingSoon ? "text-neutral-400 dark:text-neutral-500" : "text-green-600 dark:text-green-400"
                            }`}
                            aria-hidden="true"
                          />
                          <div className="flex flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-neutral-600 dark:text-neutral-300">
                            <span className={comingSoon ? "text-neutral-500 dark:text-neutral-400" : ""}>
                              {t(feature.labelKey)}
                            </span>
                            {feature.descKey && (
                              <InfoHint label={t(feature.labelKey)} content={t(feature.descKey)} />
                            )}
                            {comingSoon && (
                              <Badge variant="secondary" className="font-medium">
                                {t("pricing.comingSoon")}
                              </Badge>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <ul className="space-y-3 flex-1">
                    {plan.features?.map((feature) => (
                      <li key={feature.text} className="flex items-start gap-2.5">
                        <feature.icon className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" aria-hidden="true" />
                        <span className="text-sm text-neutral-600 dark:text-neutral-300">{feature.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {/* Enterprise deep-dive */}
        <EnterpriseSection />

        {/* Social proof */}
        <div className="mt-20 text-center">
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-8">
            {t("pricing.trustedBy")}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-5 bg-white dark:bg-neutral-900">
              <p className="text-3xl font-black text-neutral-900 dark:text-white">50+</p>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{t("pricing.criteriaChecked")}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-5 bg-white dark:bg-neutral-900">
              <p className="text-3xl font-black text-neutral-900 dark:text-white">7</p>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{t("pricing.euLanguages")}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-5 bg-white dark:bg-neutral-900">
              <p className="text-3xl font-black text-neutral-900 dark:text-white">GDPR</p>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{t("pricing.euDataResidency")}</p>
            </div>
          </div>
        </div>

        {/* Final CTA */}
        <div className="mt-16 rounded-2xl bg-neutral-900 dark:bg-white p-8 sm:p-12 text-center">
          <h2 className="text-2xl font-bold text-white dark:text-neutral-900">
            {t("pricing.readyCta")}
          </h2>
          <p className="mt-2 text-neutral-400 dark:text-neutral-600 max-w-lg mx-auto">
            {t("pricing.readyDesc")}
          </p>
          <Link
            href="/auth/login"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white dark:bg-neutral-900 px-6 py-3 text-sm font-medium text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white dark:focus-visible:ring-neutral-900 focus-visible:ring-offset-neutral-900 dark:focus-visible:ring-offset-white"
          >
            {t("pricing.startTrial")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
