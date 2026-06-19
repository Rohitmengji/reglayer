"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Shield,
  Scan,
  BarChart3,
  FileText,
  Zap,
  Globe,
  CheckCircle2,
  ArrowRight,
  Users,
  Lock,
  Clock,
  Star,
  Languages,
  ChevronDown,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Footer } from "@/components/layout/footer";
import { DemoScan } from "@/components/demo-scan";
import { AnimatedStats } from "@/components/animated-stats";
import { ProductTour } from "@/components/product-tour";
import { useI18n } from "@/components/i18n-provider";
import { SUPPORTED_LOCALES } from "@/lib/i18n/translations";

export function LandingContent() {
  const { t, locale, setLocale } = useI18n();
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentLocale = SUPPORTED_LOCALES.find((l) => l.code === locale);

  return (
    <>
      <ProductTour />
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-neutral-100 bg-white/80 backdrop-blur-md dark:bg-neutral-950/80 dark:border-neutral-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 dark:bg-white">
              <svg className="h-4 w-4 text-white dark:text-neutral-900" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" strokeLinecap="round">
                <path d="M13 1.5 24.5 7.5 13 13.5 1.5 7.5 13 1.5Z" fill="currentColor" />
                <path d="M1.5 13 13 19 24.5 13" />
                <path d="M1.5 18.5 13 24.5 24.5 18.5" />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">RegLayer</span>
          </div>
          <nav className="hidden lg:flex items-center gap-6">
            <a href="#features" className="text-sm text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors">{t("landing.navFeatures")}</a>
            <a href="#compliance" className="text-sm text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors">{t("landing.navCompliance")}</a>
            <a href="#testimonials" className="text-sm text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors">{t("landing.navTestimonials")}</a>
            <Link href="/pricing" className="text-sm text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors">{t("landing.navPricing")}</Link>
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="relative" ref={langRef}>
              <button
                onClick={() => setLangOpen(!langOpen)}
                className="inline-flex items-center gap-1 sm:gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 sm:px-2.5 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-all"
                aria-label="Select language"
                aria-expanded={langOpen}
              >
                <span className="text-sm leading-none">{currentLocale?.flag}</span>
                <ChevronDown className={`h-3 w-3 text-neutral-400 transition-transform duration-200 ${langOpen ? "rotate-180" : ""}`} />
              </button>
              {langOpen && (
                <div className="absolute right-0 top-full mt-2 w-40 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg shadow-neutral-200/50 dark:shadow-neutral-900/50 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  {SUPPORTED_LOCALES.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => { setLocale(l.code as typeof locale); setLangOpen(false); }}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                        locale === l.code
                          ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium"
                          : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
                      }`}
                    >
                      <span className="text-sm leading-none">{l.flag}</span>
                      <span>{l.name}</span>
                      {locale === l.code && (
                        <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-green-600" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <ThemeToggle />
            <Link
              href="/auth/login"
              data-tour="get-started"
              className="rounded-md bg-neutral-900 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white hover:bg-neutral-800 transition-colors dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 whitespace-nowrap"
            >
              <span className="sm:hidden">Get Started</span>
              <span className="hidden sm:inline">{t("landing.getStarted")}</span>
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="mx-auto max-w-5xl px-4 sm:px-6 pt-10 sm:pt-20 pb-12 sm:pb-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-8">
            <Zap className="h-3 w-3" />
            {t("landing.heroBadge")}
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-6xl leading-[1.1]">
            {t("landing.heroTitle")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base sm:text-lg text-neutral-600 dark:text-neutral-300 leading-relaxed">
            {t("landing.heroDesc")}
          </p>
          <div className="mt-10 flex flex-col sm:flex-row justify-center gap-4">
            <Link
              href="/auth/login"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-900 px-6 py-3.5 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
            >
              {t("landing.startScanning")}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-6 py-3.5 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
            >
              {t("landing.viewPricing")}
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-neutral-500 dark:text-neutral-400">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> {t("landing.noCreditCard")}</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> {t("landing.wcagCompliant")}</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> {t("landing.globalStandards")}</span>
          </div>

          {/* Demo Scan — convert visitors without signup */}
          <DemoScan />
        </section>

        {/* Social Proof */}
        <section className="border-y border-neutral-100 dark:border-neutral-800 py-12 sm:py-16">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="text-center mb-6 sm:mb-8">
              <p className="inline-flex items-center gap-2 rounded-full bg-neutral-100 dark:bg-neutral-800 px-3 sm:px-4 py-1.5 text-[10px] sm:text-xs font-medium uppercase tracking-wider text-neutral-600 dark:text-neutral-300">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                {t("landing.trustedBy")}
              </p>
            </div>
            <AnimatedStats
              stats={[
                { value: "< 30s", label: t("landing.scanTime"), icon: "speed" },
                { value: "80+", label: t("landing.wcagRules"), icon: "scan" },
              ]}
            />
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center mb-10 sm:mb-16" data-tour="features">
              <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white">
                {t("landing.everythingYouNeed")}
              </h2>
              <p className="mt-3 text-neutral-600 dark:text-neutral-400 max-w-xl mx-auto">
                {t("landing.featuresSubtitle")}
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureCard icon={Scan} title={t("landing.deepScanning")} description={t("landing.deepScanningDesc")} />
              <FeatureCard icon={Globe} title={t("landing.fullSiteCrawling")} description={t("landing.fullSiteCrawlingDesc")} />
              <FeatureCard icon={BarChart3} title={t("landing.multiStandard")} description={t("landing.multiStandardDesc")} />
              <FeatureCard icon={FileText} title={t("landing.auditReports")} description={t("landing.auditReportsDesc")} />
              <FeatureCard icon={Zap} title={t("landing.aiFixes")} description={t("landing.aiFixesDesc")} />
              <FeatureCard icon={Clock} title={t("landing.continuousMonitoring")} description={t("landing.continuousMonitoringDesc")} />
            </div>
          </div>
        </section>

        {/* Compliance Standards */}
        <section id="compliance" className="bg-neutral-50 dark:bg-neutral-900 border-y border-neutral-100 dark:border-neutral-800 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid lg:grid-cols-2 gap-10 sm:gap-16 items-center">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white">
                  {t("landing.builtForStandards")}
                </h2>
                <p className="mt-4 text-neutral-600 dark:text-neutral-300 leading-relaxed">
                  {t("landing.standardsDesc")}
                </p>
                <ul className="mt-8 space-y-4">
                  {([
                    "landing.standardWcag",
                    "landing.standardAda",
                    "landing.standard508",
                    "landing.standardEaa",
                    "landing.standardAoda",
                    "landing.standardVpat",
                    "landing.standardLangs",
                  ] as const).map((key) => (
                    <li key={key} className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                      <span className="text-sm text-neutral-700 dark:text-neutral-300">{t(key)}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/auth/login"
                  className="mt-8 inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
                >
                  {t("landing.checkCompliance")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-8 space-y-4">
                {[
                  { standard: "WCAG 2.2 AA", statusKey: "landing.supported" as const, color: "bg-green-100 text-green-700" },
                  { standard: "ADA Title III", statusKey: "landing.supported" as const, color: "bg-green-100 text-green-700" },
                  { standard: "Section 508", statusKey: "landing.supported" as const, color: "bg-green-100 text-green-700" },
                  { standard: "EAA / EN 301 549", statusKey: "landing.supported" as const, color: "bg-green-100 text-green-700" },
                  { standard: "AODA (Canada)", statusKey: "landing.supported" as const, color: "bg-green-100 text-green-700" },
                  { standard: "JIS X 8341 (Japan)", statusKey: "landing.mapped" as const, color: "bg-blue-100 text-blue-700" },
                ].map((row) => (
                  <div key={row.standard} className="flex items-center justify-between py-3 border-b border-neutral-100 dark:border-neutral-700 last:border-0">
                    <span className="text-sm font-medium text-neutral-900 dark:text-white">{row.standard}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${row.color}`}>{t(row.statusKey)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section id="testimonials" className="py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white mb-10 sm:mb-12">
              {t("landing.whatTeamsSay")}
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              {([
                { quoteKey: "landing.testimonial1Quote" as const, authorKey: "landing.testimonial1Author" as const, roleKey: "landing.testimonial1Role" as const, stars: 5 },
                { quoteKey: "landing.testimonial2Quote" as const, authorKey: "landing.testimonial2Author" as const, roleKey: "landing.testimonial2Role" as const, stars: 5 },
                { quoteKey: "landing.testimonial3Quote" as const, authorKey: "landing.testimonial3Author" as const, roleKey: "landing.testimonial3Role" as const, stars: 5 },
              ]).map((item) => (
                <div key={item.authorKey} className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-6">
                  <div className="flex gap-0.5 mb-3">
                    {Array.from({ length: item.stars }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">&ldquo;{t(item.quoteKey)}&rdquo;</p>
                  <div className="mt-4 border-t border-neutral-100 dark:border-neutral-700 pt-4">
                    <p className="text-sm font-semibold text-neutral-900 dark:text-white">{t(item.authorKey)}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{t(item.roleKey)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Security & Trust */}
        <section className="border-y border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8 text-center">
              {[
                { icon: Lock, labelKey: "landing.soc2" as const, subKey: "landing.soc2Sub" as const },
                { icon: Shield, labelKey: "landing.gdpr" as const, subKey: "landing.gdprSub" as const },
                { icon: Globe, labelKey: "landing.euHosted" as const, subKey: "landing.euHostedSub" as const },
                { icon: Users, labelKey: "landing.ssoRbac" as const, subKey: "landing.ssoRbacSub" as const },
              ].map((item) => (
                <div key={item.labelKey} className="flex flex-col items-center">
                  <item.icon className="h-6 w-6 text-neutral-700 dark:text-neutral-300 mb-2" />
                  <p className="text-sm font-semibold text-neutral-900 dark:text-white">{t(item.labelKey)}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{t(item.subKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white">
              {t("landing.ctaTitle")}
            </h2>
            <p className="mt-4 text-base sm:text-lg text-neutral-600 dark:text-neutral-300 leading-relaxed">
              {t("landing.ctaDesc")}
            </p>
            <div className="mt-10 flex flex-col sm:flex-row justify-center gap-4">
              <Link
                href="/auth/login"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-900 px-8 py-4 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
              >
                {t("landing.getStartedFree")}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-8 py-4 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
              >
                {t("landing.comparePlans")}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-6 hover:border-neutral-300 dark:hover:border-neutral-600 hover:shadow-sm transition-all">
      <div className="rounded-lg bg-neutral-100 dark:bg-neutral-800 p-2.5 w-fit">
        <Icon className="h-5 w-5 text-neutral-700 dark:text-neutral-300" />
      </div>
      <h3 className="mt-4 font-semibold text-neutral-900 dark:text-white">{title}</h3>
      <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">{description}</p>
    </div>
  );
}
