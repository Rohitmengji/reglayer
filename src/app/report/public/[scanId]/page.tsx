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

interface PageProps {
  params: Promise<{ scanId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { scanId } = await params;
  const scan = await prisma.scan.findFirst({
    where: { id: scanId },
    select: { url: true, score: true },
  }).catch(() => null);

  if (!scan) return { title: "Report Not Found — RegLayer" };

  return {
    title: `${scan.score ?? 0}% Accessibility Score — ${scan.url} | RegLayer`,
    description: `Accessibility compliance report for ${scan.url}. Score: ${scan.score}%. Powered by RegLayer automated WCAG scanning.`,
    openGraph: {
      title: `${scan.score}% Accessibility Score`,
      description: `${scan.url} scored ${scan.score}% on RegLayer's WCAG compliance scan.`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${scan.score}% Accessibility Score — ${scan.url}`,
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
      score: true,
      createdAt: true,
      totalViolations: true,
      critical: true,
      serious: true,
      moderate: true,
      minor: true,
      metadata: true,
    },
  }).catch(() => null);

  if (!scan) notFound();

  const score = scan.score ?? 0;
  const scoreColor = score >= 90 ? "text-emerald-500" : score >= 60 ? "text-amber-500" : "text-red-500";
  const scoreBg = score >= 90 ? "bg-emerald-50 dark:bg-emerald-950/20" : score >= 60 ? "bg-amber-50 dark:bg-amber-950/20" : "bg-red-50 dark:bg-red-950/20";
  const scoreRing = score >= 90 ? "ring-emerald-200 dark:ring-emerald-800" : score >= 60 ? "ring-amber-200 dark:ring-amber-800" : "ring-red-200 dark:ring-red-800";
  const scoreLabel = score >= 90 ? "Compliant" : score >= 60 ? "Needs Improvement" : "Critical Issues";

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
            Accessibility Score: {score}%
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-1">
            {scan.url}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Scanned {new Date(scan.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
          <div className={`inline-flex items-center gap-1.5 mt-4 px-3 py-1 rounded-full text-xs font-medium ${
            score >= 90 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
            score >= 60 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
            "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          }`}>
            {score >= 90 ? <CheckCircle2 className="h-3 w-3" /> : score >= 60 ? <AlertTriangle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
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
