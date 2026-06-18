/**
 * ---------------------------------------------------------
 * RegLayer — Public Shareable Report Page
 * ---------------------------------------------------------
 *
 * WHY: Viral growth loop. Users share their compliance score,
 * non-users see a beautiful report and want one too.
 * Like Lighthouse scores but for accessibility compliance.
 *
 * WHAT:
 * - Public (no auth required) report page
 * - Beautiful compliance score display
 * - Summary of findings with visual breakdown
 * - "Powered by RegLayer" branding (free tier watermark)
 * - OG metadata for social sharing (score as image)
 * - Link to sign up
 *
 * HOW:
 * - Server-rendered for SEO and social preview
 * - Fetches scan data from DB (only public-flagged scans)
 * - Generates dynamic metadata with score in title
 * ---------------------------------------------------------
 */

import { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/database/prisma";
import Link from "next/link";
import { Shield, CheckCircle2, AlertTriangle, XCircle, ExternalLink, ArrowRight } from "lucide-react";
import { scoreFromStoredViolations } from "@/lib/scoring/reportScore";

interface PageProps {
  params: Promise<{ scanId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { scanId } = await params;
  const scan = await prisma.scan.findFirst({
    where: { id: scanId },
    select: { url: true, violations: { select: { impact: true, affectedElements: true } } },
  }).catch(() => null);

  if (!scan) return { title: "Report Not Found — RegLayer" };

  // Same canonical score as the page body, so the social-preview title agrees.
  const score = Math.round(scoreFromStoredViolations(scan.violations));

  return {
    title: `Accessibility Score ${score}/100 — ${scan.url} | RegLayer`,
    description: `Automated accessibility scan for ${scan.url}. Score: ${score}/100. Automated WCAG scanning by RegLayer — not a conformance determination.`,
    openGraph: {
      title: `Accessibility Score ${score}/100`,
      description: `${scan.url} scored ${score}/100 on RegLayer's automated WCAG scan.`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `Accessibility Score ${score}/100 — ${scan.url}`,
    },
    // SECURITY: do NOT let search engines index by-link reports — that passively
    // exposed every scanned site's URL + violation profile to anyone searching.
    // Reports remain viewable by direct link (the intended share behavior); a
    // proper opt-in `isPublic` flag is the follow-up (needs a DB migration).
    robots: { index: false, follow: false },
  };
}

export default async function PublicReportPage({ params }: PageProps) {
  const { scanId } = await params;

  const scan = await prisma.scan.findFirst({
    where: { id: scanId },
    select: {
      id: true,
      url: true,
      createdAt: true,
      totalViolations: true,
      critical: true,
      serious: true,
      moderate: true,
      minor: true,
      metadata: true,
      violations: { select: { impact: true, affectedElements: true } },
    },
  }).catch(() => null);

  if (!scan) notFound();

  // Canonical score recomputed from violations (shared with report/[id], badge,
  // certificate) so the same scan never shows two different numbers. Band the
  // color/label on the precise value and display the rounded integer — matching
  // report/[id] + badge so boundary scores get the same verdict everywhere.
  const precise = scoreFromStoredViolations(scan.violations);
  const score = Math.round(precise);
  const scoreColor = precise >= 90 ? "text-emerald-500" : precise >= 60 ? "text-amber-500" : "text-red-500";
  const scoreBg = precise >= 90 ? "bg-emerald-50 dark:bg-emerald-950/20" : precise >= 60 ? "bg-amber-50 dark:bg-amber-950/20" : "bg-red-50 dark:bg-red-950/20";
  const scoreRing = precise >= 90 ? "ring-emerald-200 dark:ring-emerald-800" : precise >= 60 ? "ring-amber-200 dark:ring-amber-800" : "ring-red-200 dark:ring-red-800";
  // Score band only — NOT a conformance verdict. "Compliant" would assert WCAG
  // conformance from an automated score, which the scan cannot establish.
  const scoreLabel = precise >= 90 ? "Strong automated score" : precise >= 60 ? "Needs Improvement" : "Critical Issues";

  const meta = (scan.metadata as Record<string, unknown> | null) ?? {};
  const pagesScanned = (meta.pagesScanned as number) ?? 1;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      {/* Header */}
      <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 sm:px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-indigo-500" />
            <span className="text-sm font-bold text-neutral-900 dark:text-white">RegLayer</span>
          </Link>
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3.5 py-2 text-xs font-medium text-white hover:bg-indigo-600 transition-colors"
          >
            Get Your Score
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-12">
        {/* Score Hero */}
        <div className="text-center mb-12">
          <div className={`inline-flex items-center justify-center w-32 h-32 rounded-full ${scoreBg} ring-4 ${scoreRing} mb-6`}>
            <span className={`text-4xl font-bold tabular-nums ${scoreColor}`}>
              {score}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
            Accessibility Score: {score} / 100
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-1">
            {scan.url}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Scanned {new Date(scan.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
          <div className={`inline-flex items-center gap-1.5 mt-4 px-3 py-1 rounded-full text-xs font-medium ${
            precise >= 90 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
            precise >= 60 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
            "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          }`}>
            {precise >= 90 ? <CheckCircle2 className="h-3 w-3" /> : precise >= 60 ? <AlertTriangle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {scoreLabel}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12">
          <StatCard label="Total Issues" value={scan.totalViolations ?? 0} />
          <StatCard label="Critical" value={scan.critical ?? 0} color={scan.critical === 0 ? "text-emerald-500" : "text-red-500"} />
          <StatCard label="Serious" value={scan.serious ?? 0} color="text-amber-500" />
          <StatCard label="Pages Scanned" value={pagesScanned} color="text-blue-500" />
        </div>

        {/* CTA */}
        <div className="text-center rounded-xl border border-neutral-200 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">
            Want this for your site?
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-6 max-w-md mx-auto">
            Get automated WCAG compliance scanning, real-time monitoring, and detailed remediation guidance. Free to start.
          </p>
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-600 transition-colors shadow-sm"
          >
            Start Free Scan
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>

        {/* Powered by */}
        <div className="mt-8 text-center">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Powered by <Link href="/" className="font-medium text-indigo-500 hover:text-indigo-400">RegLayer</Link> — Web Accessibility Compliance Platform
          </p>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, color = "text-neutral-900 dark:text-white" }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 text-center dark:border-neutral-800 dark:bg-neutral-900" role="group" aria-label={`${label}: ${value}`}>
      <div className={`text-2xl font-bold tabular-nums ${color}`} aria-hidden="true">{value}</div>
      <div className="text-xs text-neutral-600 dark:text-neutral-300 mt-1">{label}</div>
    </div>
  );
}
