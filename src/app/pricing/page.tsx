"use client";

/**
 * RegLayer — Pricing Page
 *
 * WHY: Convert free users to paid plans. Show value of Pro and Enterprise.
 * WHAT: 3-tier pricing cards (Free/Pro/Enterprise) with monthly/annual toggle and feature comparison.
 * HOW: Client component for billing period toggle. Links to /auth/login for sign-up. Shows plan limits and features.
 */

import { useState } from "react";
import Link from "next/link";
import { Shield, Check, Zap, Building2, ArrowRight, Globe, Users, Scan, FileText, BarChart3, Webhook, Lock } from "lucide-react";
import { Footer } from "@/components/layout/footer";
import { useI18n } from "@/components/i18n-provider";
import { PLAN_LIMITS } from "@/lib/credits/plan-limits";

// Single source of truth: the displayed scan allowance is DERIVED from the
// enforced backend limit, so pricing can never advertise more than users get.
const scansLabel = (n: number) => (n === -1 ? "Unlimited scans" : `${n} scans per month`);

const plans = [
  {
    id: "free",
    name: "Free",
    description: "For individuals and small projects",
    price: { monthly: 0, annual: 0 },
    cta: "Get Started",
    ctaVariant: "outline" as const,
    features: [
      { text: scansLabel(PLAN_LIMITS.FREE.scansPerMonth), icon: Scan },
      { text: "1 monitored site", icon: Globe },
      { text: "WCAG 2.1 Level AA checks", icon: Check },
      { text: "Basic compliance score", icon: BarChart3 },
      { text: "Public share links", icon: FileText },
      { text: "Community support", icon: Users },
    ],
    limits: {
      scansPerMonth: PLAN_LIMITS.FREE.scansPerMonth,
      sites: 1,
      teamMembers: 1,
    },
  },
  {
    id: "pro",
    name: "Pro",
    description: "For teams shipping to the EU market",
    price: { monthly: 49, annual: 39 },
    cta: "Start Free Trial",
    ctaVariant: "primary" as const,
    popular: true,
    features: [
      { text: scansLabel(PLAN_LIMITS.PRO.scansPerMonth), icon: Scan },
      { text: "10 monitored sites", icon: Globe },
      { text: "EN 301 549 compliance", icon: Check },
      { text: "Accessibility Statement generator", icon: FileText },
      { text: "Compliance certificates", icon: Lock },
      { text: "Multi-page crawling (50 pages)", icon: Globe },
      { text: "AI-powered fix suggestions", icon: Zap },
      { text: "Scheduled monitoring", icon: BarChart3 },
      { text: "Webhook integrations", icon: Webhook },
      { text: "5 team members", icon: Users },
      { text: "Priority email support", icon: Check },
    ],
    limits: {
      scansPerMonth: PLAN_LIMITS.PRO.scansPerMonth,
      sites: 10,
      teamMembers: 5,
    },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "For organizations with complex compliance needs",
    price: { monthly: 199, annual: 159 },
    cta: "Contact Sales",
    ctaVariant: "outline" as const,
    features: [
      { text: "Everything in Pro", icon: Check },
      { text: "Unlimited sites & crawling", icon: Globe },
      { text: "Unlimited team members", icon: Users },
      { text: "VPAT/ACR report generation", icon: FileText },
      { text: "Custom compliance rules", icon: Lock },
      { text: "Jira & Slack integration", icon: Webhook },
      { text: "API access (CI/CD gate)", icon: Zap },
      { text: "Audit trail & evidence export", icon: BarChart3 },
      { text: "White-label reports", icon: FileText },
      { text: "SSO (SAML/OIDC)", icon: Lock },
      { text: "Dedicated account manager", icon: Users },
      { text: "SLA guarantee (99.9%)", icon: Check },
    ],
    limits: {
      scansPerMonth: -1,
      sites: -1,
      teamMembers: -1,
    },
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
          <Link href="/" className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-neutral-900 dark:text-white" />
            <span className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">RegLayer</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="rounded-md px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
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
            <Building2 className="h-3 w-3" />
            EAA Compliance Deadline Passed — Act Now
          </div>
          <h1 className="text-4xl font-black text-neutral-900 dark:text-white sm:text-5xl">
            {t("pricing.title")}
          </h1>
          <p className="mt-4 text-lg text-neutral-500 dark:text-neutral-400 max-w-2xl mx-auto">
            {t("pricing.subtitle")}
          </p>

          {/* Billing Toggle */}
          <div className="mt-8 inline-flex items-center gap-3 rounded-full bg-neutral-100 dark:bg-neutral-800 p-1">
            <button
              onClick={() => setBilling("monthly")}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                billing === "monthly"
                  ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm"
                  : "text-neutral-500 dark:text-neutral-400"
              }`}
            >
              {t("pricing.monthly")}
            </button>
            <button
              onClick={() => setBilling("annual")}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          {plans.map((plan) => {
            const price = billing === "annual" ? plan.price.annual : plan.price.monthly;
            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border p-6 lg:p-8 flex flex-col ${
                  plan.popular
                    ? "border-neutral-900 dark:border-white shadow-xl scale-[1.02]"
                    : "border-neutral-200 dark:border-neutral-700"
                } bg-white dark:bg-neutral-900`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-neutral-900 dark:bg-white px-3 py-1 text-xs font-semibold text-white dark:text-neutral-900">
                    {t("pricing.mostPopular")}
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-lg font-bold text-neutral-900 dark:text-white">{plan.name}</h3>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{plan.description}</p>
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
                      Billed annually (€{price * 12}/year)
                    </p>
                  )}
                </div>

                <Link
                  href={plan.id === "enterprise" ? "/contact" : "/auth/login"}
                  className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium text-center transition-colors mb-6 block ${
                    plan.ctaVariant === "primary"
                      ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100"
                      : "border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  }`}
                >
                  {plan.cta}
                  {plan.ctaVariant === "primary" && <ArrowRight className="inline h-4 w-4 ml-1" />}
                </Link>

                <div className="space-y-3 flex-1">
                  {plan.features.map((feature) => (
                    <div key={feature.text} className="flex items-start gap-2.5">
                      <feature.icon className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                      <span className="text-sm text-neutral-600 dark:text-neutral-300">{feature.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* FAQ / Trust */}
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

        {/* CTA */}
        <div className="mt-16 rounded-2xl bg-neutral-900 dark:bg-white p-8 sm:p-12 text-center">
          <h2 className="text-2xl font-bold text-white dark:text-neutral-900">
            {t("pricing.readyCta")}
          </h2>
          <p className="mt-2 text-neutral-500 dark:text-neutral-500 max-w-lg mx-auto">
            {t("pricing.readyDesc")}
          </p>
          <Link
            href="/auth/login"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white dark:bg-neutral-900 px-6 py-3 text-sm font-medium text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            {t("pricing.startTrial")} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
