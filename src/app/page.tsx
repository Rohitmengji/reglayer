import Link from "next/link";
import { Shield, Scan, BarChart3, FileText, Zap, Globe } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <header className="border-b border-neutral-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-neutral-900" />
            <span className="text-lg font-bold tracking-tight">RegLayer</span>
          </div>
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
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="mx-auto max-w-4xl px-6 py-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-600 mb-6">
            <Zap className="h-3 w-3" />
            European Accessibility Act Compliance
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl">
            Accessibility compliance,
            <br />
            <span className="text-neutral-500">automated.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-600">
            RegLayer scans your websites for WCAG 2.1 violations, generates compliance reports,
            and helps you meet the European Accessibility Act requirements — all in one platform.
          </p>
          <div className="mt-10 flex justify-center gap-4">
            <Link
              href="/auth/login"
              className="rounded-md bg-neutral-900 px-6 py-3 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
            >
              Start Scanning
            </Link>
            <Link
              href="/auth/login"
              className="rounded-md border border-neutral-200 bg-white px-6 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              View Demo
            </Link>
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-neutral-100 bg-neutral-50 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-center text-2xl font-bold text-neutral-900">
              Everything you need for compliance
            </h2>
            <p className="mt-2 text-center text-neutral-500">
              Built for developers and compliance teams.
            </p>
            <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureCard
                icon={Scan}
                title="Deep Scanning"
                description="axe-core powered WCAG 2.1 analysis with headless Chromium. Scan any public URL in seconds."
              />
              <FeatureCard
                icon={Globe}
                title="Multi-Page Crawling"
                description="Automatically crawl and scan multiple pages to find site-wide accessibility issues."
              />
              <FeatureCard
                icon={BarChart3}
                title="Compliance Scoring"
                description="Get a clear compliance score mapped to EAA, WCAG 2.1 AA, and EN 301 549 standards."
              />
              <FeatureCard
                icon={FileText}
                title="PDF Reports"
                description="Export professional compliance reports for auditors, stakeholders, and legal teams."
              />
              <FeatureCard
                icon={Zap}
                title="AI Explanations"
                description="GPT-powered plain-language explanations of violations with actionable fix suggestions."
              />
              <FeatureCard
                icon={Shield}
                title="Scheduled Monitoring"
                description="Set up recurring scans to catch regressions before they reach production."
              />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20">
          <div className="mx-auto max-w-2xl px-6 text-center">
            <h2 className="text-2xl font-bold text-neutral-900">
              Ready to achieve compliance?
            </h2>
            <p className="mt-3 text-neutral-500">
              Start scanning today. No credit card required.
            </p>
            <Link
              href="/auth/login"
              className="mt-8 inline-block rounded-md bg-neutral-900 px-6 py-3 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
            >
              Get Started Free
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-100 py-8">
        <div className="mx-auto max-w-6xl px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-neutral-400" />
            <span className="text-sm text-neutral-400">RegLayer v0.1.0</span>
          </div>
          <p className="text-xs text-neutral-400">
            European Accessibility Act Compliance Platform
          </p>
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
    <div className="rounded-lg border border-neutral-200 bg-white p-6">
      <Icon className="h-5 w-5 text-neutral-700" />
      <h3 className="mt-3 font-semibold text-neutral-900">{title}</h3>
      <p className="mt-2 text-sm text-neutral-500">{description}</p>
    </div>
  );
}
