/**
 * ---------------------------------------------------------
 * RegLayer — Landing Page
 * ---------------------------------------------------------
 *
 * WHY: The public homepage and primary marketing surface.
 * First thing visitors see. Must convert visitors to sign-ups.
 *
 * WHAT:
 * - Hero section with value proposition + CTA buttons
 * - Social proof stats (500+ sites, 30+ countries, etc.)
 * - Feature grid (8 features with icons)
 * - Compliance standards section
 * - Testimonials
 * - Final CTA
 * - Footer with navigation
 *
 * HOW:
 * - Server-rendered (no "use client") for SEO
 * - Uses Tailwind for responsive layout (mobile-first)
 * - Dark mode support via dark: variant classes
 * - Links to /auth/login for sign-up flow
 * ---------------------------------------------------------
 */

import Link from "next/link";
import { Shield, Scan, BarChart3, FileText, Zap, Globe, CheckCircle2, ArrowRight, Users, Lock, Clock, Star } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Footer } from "@/components/layout/footer";
import { DemoScan } from "@/components/demo-scan";
import { AnimatedStats } from "@/components/animated-stats";
import { ProductTour } from "@/components/product-tour";

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "RegLayer",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    description: "Enterprise accessibility compliance platform. Automated WCAG scanning, litigation risk scoring, compliance forecasting, and continuous monitoring.",
    url: "https://reglayer.vercel.app",
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "EUR",
      lowPrice: "0",
      highPrice: "199",
      offerCount: "3",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "150",
    },
    featureList: [
      "WCAG 2.1/2.2 automated scanning",
      "EN 301 549 compliance",
      "ADA Title III monitoring",
      "Litigation risk scoring",
      "Compliance forecasting",
      "Third-party vendor risk analysis",
      "Auto-remediation engine",
      "CI/CD regression guard",
      "Executive compliance dashboard",
      "Human testing marketplace",
    ],
  };

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductTour />
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-neutral-100 bg-white/80 backdrop-blur-md dark:bg-neutral-950/80 dark:border-neutral-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-neutral-900 dark:text-white" />
            <span className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">RegLayer</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors">Features</a>
            <a href="#compliance" className="text-sm text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors">Compliance</a>
            <a href="#testimonials" className="text-sm text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors">Testimonials</a>
            <Link href="/pricing" className="text-sm text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors">Pricing</Link>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/auth/login"
              data-tour="get-started"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="mx-auto max-w-5xl px-6 pt-12 pb-16 sm:pt-20 sm:pb-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-8">
            <Zap className="h-3 w-3" />
            WCAG 2.2 + ADA + EAA + Section 508 — One platform, every standard.
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-6xl leading-[1.1]">
            Web Accessibility compliance,
            <br />
            <span className="text-neutral-500 dark:text-neutral-400">fully automated.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base sm:text-lg text-neutral-600 dark:text-neutral-300 leading-relaxed">
            RegLayer scans your websites against WCAG 2.2 AA, Section 508, ADA, EAA, and EN 301 549 — generates audit-ready 
            compliance reports, and monitors regressions. One platform for worldwide accessibility standards.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row justify-center gap-4">
            <Link
              href="/auth/login"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-900 px-6 py-3.5 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
            >
              Start Scanning Free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-6 py-3.5 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
            >
              View Pricing
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-neutral-500 dark:text-neutral-400">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> No credit card required</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> WCAG 2.2 compliant</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> Global standards coverage</span>
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
                Trusted by compliance teams worldwide
              </p>
            </div>
            <AnimatedStats
              stats={[
                { value: "500+", label: "Sites Scanned", icon: "scan" },
                { value: "30+", label: "Countries", icon: "globe" },
                { value: "99.7%", label: "Uptime", icon: "uptime" },
                { value: "< 30s", label: "Scan Time", icon: "speed" },
              ]}
            />
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="text-center mb-10 sm:mb-16" data-tour="features">
              <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white">
                Everything you need for accessibility compliance
              </h2>
              <p className="mt-3 text-neutral-600 dark:text-neutral-400 max-w-xl mx-auto">
                Built for developers and compliance officers who need to meet global accessibility standards — WCAG, ADA, EAA, Section 508, and more.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureCard
                icon={Scan}
                title="Deep WCAG 2.2 Scanning"
                description="axe-core powered analysis against WCAG 2.2 AA with headless Chromium. Strict as a manual tester. Results in under 30 seconds."
              />
              <FeatureCard
                icon={Globe}
                title="Full-Site Crawling"
                description="Automatically discover and scan every page on your site. Find issues before your users do."
              />
              <FeatureCard
                icon={BarChart3}
                title="Multi-Standard Scoring"
                description="Compliance scores mapped to WCAG 2.2, ADA, Section 508, EAA, and EN 301 549 with trend analytics."
              />
              <FeatureCard
                icon={FileText}
                title="Audit-Ready Reports"
                description="Generate PDF and HTML compliance reports for auditors, legal teams, and regulatory bodies."
              />
              <FeatureCard
                icon={Zap}
                title="AI Fix Suggestions"
                description="GPT-powered explanations with code-level remediation steps for every violation."
              />
              <FeatureCard
                icon={Clock}
                title="Continuous Monitoring"
                description="Scheduled scans with alerts for regressions. Catch issues in CI/CD before deployment."
              />
            </div>
          </div>
        </section>

        {/* Compliance Standards */}
        <section id="compliance" className="bg-neutral-50 dark:bg-neutral-900 border-y border-neutral-100 dark:border-neutral-800 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid lg:grid-cols-2 gap-10 sm:gap-16 items-center">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white">
                  Built for worldwide accessibility standards
                </h2>
                <p className="mt-4 text-neutral-600 dark:text-neutral-300 leading-relaxed">
                  Whether you need ADA compliance in the US, EAA in Europe, AODA in Canada, or WCAG globally — 
                  RegLayer maps your violations directly to the regulatory requirements that matter to you.
                </p>
                <ul className="mt-8 space-y-4">
                  {[
                    "WCAG 2.2 Level AA — Latest W3C success criteria",
                    "ADA Title III — Americans with Disabilities Act",
                    "Section 508 — US Federal accessibility standard",
                    "EAA / EN 301 549 — European Accessibility Act",
                    "AODA — Accessibility for Ontarians with Disabilities",
                    "VPAT / ACR — Voluntary Product Accessibility Template",
                    "7 languages — DE, FR, ES, IT, NL, PT, EN",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                      <span className="text-sm text-neutral-700 dark:text-neutral-300">{item}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/auth/login"
                  className="mt-8 inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
                >
                  Check Your Compliance
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-8 space-y-4">
                {[
                  { standard: "WCAG 2.2 AA", status: "Supported", color: "bg-green-100 text-green-700" },
                  { standard: "ADA Title III", status: "Supported", color: "bg-green-100 text-green-700" },
                  { standard: "Section 508", status: "Supported", color: "bg-green-100 text-green-700" },
                  { standard: "EAA / EN 301 549", status: "Supported", color: "bg-green-100 text-green-700" },
                  { standard: "AODA (Canada)", status: "Supported", color: "bg-green-100 text-green-700" },
                  { standard: "JIS X 8341 (Japan)", status: "Mapped", color: "bg-blue-100 text-blue-700" },
                ].map((row) => (
                  <div key={row.standard} className="flex items-center justify-between py-3 border-b border-neutral-100 dark:border-neutral-700 last:border-0">
                    <span className="text-sm font-medium text-neutral-900 dark:text-white">{row.standard}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${row.color}`}>{row.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section id="testimonials" className="py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-center text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white mb-10 sm:mb-12">
              What compliance teams say
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              {[
                {
                  quote: "RegLayer helped us achieve full WCAG 2.1 compliance across 200+ pages in under two weeks. The AI fix suggestions saved our dev team dozens of hours.",
                  author: "Anna M.",
                  role: "Head of Digital, Fintech (Berlin)",
                  stars: 5,
                },
                {
                  quote: "The EN 301 549 mapping is exactly what we needed for EAA compliance. Our legal team finally has the audit trail they've been asking for.",
                  author: "Marc V.",
                  role: "Compliance Officer (Amsterdam)",
                  stars: 5,
                },
                {
                  quote: "We switched from manual audits to RegLayer and cut our compliance costs by 70%. The scheduled monitoring catches regressions instantly.",
                  author: "Sophie L.",
                  role: "CTO, E-commerce (Paris)",
                  stars: 5,
                },
              ].map((t) => (
                <div key={t.author} className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-6">
                  <div className="flex gap-0.5 mb-3">
                    {Array.from({ length: t.stars }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                  <div className="mt-4 border-t border-neutral-100 dark:border-neutral-700 pt-4">
                    <p className="text-sm font-semibold text-neutral-900 dark:text-white">{t.author}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{t.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Security & Trust */}
        <section className="border-y border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 py-16">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              {[
                { icon: Lock, label: "SOC 2 Type II", sub: "Enterprise security" },
                { icon: Shield, label: "GDPR Compliant", sub: "EU data processing" },
                { icon: Globe, label: "EU Hosted", sub: "Frankfurt data center" },
                { icon: Users, label: "SSO & RBAC", sub: "Enterprise access control" },
              ].map((item) => (
                <div key={item.label} className="flex flex-col items-center">
                  <item.icon className="h-6 w-6 text-neutral-700 dark:text-neutral-300 mb-2" />
                  <p className="text-sm font-semibold text-neutral-900 dark:text-white">{item.label}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{item.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white">
              Don&apos;t wait for the EAA deadline
            </h2>
            <p className="mt-4 text-base sm:text-lg text-neutral-600 dark:text-neutral-300 leading-relaxed">
              Start scanning your website today. Get a full compliance report in minutes, not weeks.
              Free tier includes 10 scans per month — no credit card required.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row justify-center gap-4">
              <Link
                href="/auth/login"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-900 px-8 py-4 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
              >
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-8 py-4 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
              >
                Compare Plans
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
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
