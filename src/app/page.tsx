import Link from "next/link";
import { Shield, Scan, BarChart3, FileText, Zap, Globe, CheckCircle2, ArrowRight, Users, Lock, Clock, Star } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-neutral-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-neutral-900" />
            <span className="text-lg font-bold tracking-tight">RegLayer</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm text-neutral-600 hover:text-neutral-900 transition-colors">Features</a>
            <a href="#compliance" className="text-sm text-neutral-600 hover:text-neutral-900 transition-colors">Compliance</a>
            <a href="#testimonials" className="text-sm text-neutral-600 hover:text-neutral-900 transition-colors">Testimonials</a>
            <Link href="/pricing" className="text-sm text-neutral-600 hover:text-neutral-900 transition-colors">Pricing</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="rounded-md px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/auth/login"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="mx-auto max-w-5xl px-6 py-24 sm:py-32 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-600 mb-8">
            <Zap className="h-3 w-3" />
            EAA deadline: June 28, 2025 — Is your site ready?
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-neutral-900 sm:text-6xl leading-[1.1]">
            EU Accessibility compliance,
            <br />
            <span className="text-neutral-400">fully automated.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-600 leading-relaxed">
            RegLayer scans your websites against WCAG 2.1 AA and EN 301 549, generates audit-ready 
            compliance reports, and monitors regressions — helping you avoid up to €100,000 in EAA fines.
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
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-6 py-3.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              View Pricing
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-neutral-500">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> No credit card required</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> GDPR compliant</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> EU data residency</span>
          </div>
        </section>

        {/* Social Proof */}
        <section className="border-y border-neutral-100 bg-neutral-50/50 py-12">
          <div className="mx-auto max-w-6xl px-6">
            <p className="text-center text-xs font-medium uppercase tracking-wider text-neutral-400 mb-8">
              Trusted by compliance teams across the EU
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 items-center">
              {["500+ Sites Scanned", "12 EU Countries", "99.7% Uptime", "< 30s Scan Time"].map((stat) => (
                <div key={stat} className="text-center">
                  <p className="text-2xl font-bold text-neutral-900">{stat.split(" ")[0]}</p>
                  <p className="text-xs text-neutral-500 mt-1">{stat.split(" ").slice(1).join(" ")}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-neutral-900">
                Everything you need for EAA compliance
              </h2>
              <p className="mt-3 text-neutral-500 max-w-xl mx-auto">
                Built for developers and compliance officers who need to meet the European Accessibility Act deadline.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureCard
                icon={Scan}
                title="Deep WCAG Scanning"
                description="axe-core powered analysis against WCAG 2.1 AA with headless Chromium. Results in under 30 seconds."
              />
              <FeatureCard
                icon={Globe}
                title="Full-Site Crawling"
                description="Automatically discover and scan every page on your site. Find issues before your users do."
              />
              <FeatureCard
                icon={BarChart3}
                title="EN 301 549 Scoring"
                description="Compliance scores mapped to EAA, WCAG 2.1 AA, and EN 301 549 with trend analytics."
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
        <section id="compliance" className="bg-neutral-50 border-y border-neutral-100 py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="text-3xl font-bold text-neutral-900">
                  Built for the European Accessibility Act
                </h2>
                <p className="mt-4 text-neutral-600 leading-relaxed">
                  The EAA takes effect June 28, 2025. Non-compliant websites face fines up to €100,000 
                  and legal action. RegLayer maps your violations directly to EU regulatory requirements.
                </p>
                <ul className="mt-8 space-y-4">
                  {[
                    "WCAG 2.1 Level AA — Full success criteria coverage",
                    "EN 301 549 — European harmonised standard",
                    "Accessibility Statement Generator — Article 7 compliant",
                    "VPAT / ACR — Voluntary Product Accessibility Template",
                    "7 languages — DE, FR, ES, IT, NL, PT, EN",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                      <span className="text-sm text-neutral-700">{item}</span>
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
              <div className="rounded-2xl border border-neutral-200 bg-white p-8 space-y-4">
                {[
                  { standard: "WCAG 2.1 AA", status: "Supported", color: "bg-green-100 text-green-700" },
                  { standard: "EN 301 549 v3.2.1", status: "Supported", color: "bg-green-100 text-green-700" },
                  { standard: "EAA (Directive 2019/882)", status: "Mapped", color: "bg-green-100 text-green-700" },
                  { standard: "GDPR Art. 25", status: "Compliant", color: "bg-green-100 text-green-700" },
                  { standard: "Section 508", status: "Supported", color: "bg-blue-100 text-blue-700" },
                ].map((row) => (
                  <div key={row.standard} className="flex items-center justify-between py-3 border-b border-neutral-100 last:border-0">
                    <span className="text-sm font-medium text-neutral-900">{row.standard}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${row.color}`}>{row.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section id="testimonials" className="py-24">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-center text-3xl font-bold text-neutral-900 mb-12">
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
                <div key={t.author} className="rounded-xl border border-neutral-200 bg-white p-6">
                  <div className="flex gap-0.5 mb-3">
                    {Array.from({ length: t.stars }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-sm text-neutral-600 leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                  <div className="mt-4 border-t border-neutral-100 pt-4">
                    <p className="text-sm font-semibold text-neutral-900">{t.author}</p>
                    <p className="text-xs text-neutral-500">{t.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Security & Trust */}
        <section className="border-y border-neutral-100 bg-neutral-50 py-16">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              {[
                { icon: Lock, label: "SOC 2 Type II", sub: "Enterprise security" },
                { icon: Shield, label: "GDPR Compliant", sub: "EU data processing" },
                { icon: Globe, label: "EU Hosted", sub: "Frankfurt data center" },
                { icon: Users, label: "SSO & RBAC", sub: "Enterprise access control" },
              ].map((item) => (
                <div key={item.label} className="flex flex-col items-center">
                  <item.icon className="h-6 w-6 text-neutral-700 mb-2" />
                  <p className="text-sm font-semibold text-neutral-900">{item.label}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">{item.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-24">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="text-3xl font-bold text-neutral-900">
              Don&apos;t wait for the EAA deadline
            </h2>
            <p className="mt-4 text-lg text-neutral-500 leading-relaxed">
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
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-8 py-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                Compare Plans
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-100 bg-neutral-50 py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Shield className="h-5 w-5 text-neutral-700" />
                <span className="font-bold text-neutral-900">RegLayer</span>
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed">
                European Accessibility Act compliance platform. Automated scanning, monitoring, and reporting.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Product</p>
              <ul className="space-y-2">
                <li><Link href="/features" className="text-sm text-neutral-600 hover:text-neutral-900">Features</Link></li>
                <li><Link href="/pricing" className="text-sm text-neutral-600 hover:text-neutral-900">Pricing</Link></li>
                <li><Link href="/standards" className="text-sm text-neutral-600 hover:text-neutral-900">Standards</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Legal</p>
              <ul className="space-y-2">
                <li><Link href="/privacy" className="text-sm text-neutral-600 hover:text-neutral-900">Privacy Policy</Link></li>
                <li><Link href="/terms" className="text-sm text-neutral-600 hover:text-neutral-900">Terms of Service</Link></li>
                <li><Link href="/cookie-policy" className="text-sm text-neutral-600 hover:text-neutral-900">Cookie Policy</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Support</p>
              <ul className="space-y-2">
                <li><Link href="/docs" className="text-sm text-neutral-600 hover:text-neutral-900">Documentation</Link></li>
                <li><Link href="/api-reference" className="text-sm text-neutral-600 hover:text-neutral-900">API Reference</Link></li>
                <li><Link href="/contact" className="text-sm text-neutral-600 hover:text-neutral-900">Contact</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-neutral-200 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-neutral-500">© 2025 RegLayer. All rights reserved.</p>
            <p className="text-xs text-neutral-400">Made in the EU 🇪🇺 · Data hosted in Frankfurt, Germany</p>
          </div>
        </div>
      </footer>
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
    <div className="rounded-xl border border-neutral-200 bg-white p-6 hover:border-neutral-300 hover:shadow-sm transition-all">
      <div className="rounded-lg bg-neutral-100 p-2.5 w-fit">
        <Icon className="h-5 w-5 text-neutral-700" />
      </div>
      <h3 className="mt-4 font-semibold text-neutral-900">{title}</h3>
      <p className="mt-2 text-sm text-neutral-500 leading-relaxed">{description}</p>
    </div>
  );
}
