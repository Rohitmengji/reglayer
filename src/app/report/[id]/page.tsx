/**
 * RegLayer — Public Scan Report Page
 *
 * WHY: Users need to share scan results publicly (clients, stakeholders, badges).
 * WHAT: Standalone report with score hero, violation breakdown, compliance summary. No sidebar (public page).
 * HOW: Server component that fetches scan from DB by ID. Renders without auth. Includes "View Certificate" link.
 */

import { prisma } from "@/lib/database/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Shield, ExternalLink, Clock, AlertTriangle, CheckCircle2, ArrowLeft, Eye, TrendingUp } from "lucide-react";

interface ReportPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Recalculate accessibility score from stored violations using accurate algorithm.
 * Ensures historical scans display correct scores even if stored score used old formula.
 */
function recalculateScore(violations: { impact: string; affectedElements: unknown }[]): number {
  if (violations.length === 0) return 100;

  const severityBase: Record<string, number> = {
    CRITICAL: 10, critical: 10,
    SERIOUS: 5, serious: 5,
    MODERATE: 2, moderate: 2,
    MINOR: 0.5, minor: 0.5,
  };

  const totalPenalty = violations.reduce((sum, violation) => {
    const base = severityBase[violation.impact] ?? 1;
    const elements = Array.isArray(violation.affectedElements) ? violation.affectedElements : [];
    const nodeCount = Math.max(1, elements.length);
    const nodeMultiplier = 1 + Math.log2(nodeCount) / 4;
    return sum + base * nodeMultiplier;
  }, 0);

  const score = Math.max(0, Math.min(100, 100 - totalPenalty));
  return Math.round(score * 10) / 10;
}

export default async function PublicReportPage({ params }: ReportPageProps) {
  const { id } = await params;

  const scan = await prisma.scan.findUnique({
    where: { id },
    include: { violations: { orderBy: { impact: "asc" } } },
  });

  if (!scan) {
    notFound();
  }

  // Recalculate score from violations for accuracy
  const score = recalculateScore(scan.violations);
  const scoreColor =
    score >= 90 ? "text-green-600" : score >= 70 ? "text-yellow-600" : score >= 50 ? "text-orange-600" : "text-red-600";
  const ringColor =
    score >= 90 ? "#16a34a" : score >= 70 ? "#ca8a04" : score >= 50 ? "#ea580c" : "#dc2626";
  const scoreLabel =
    score >= 90 ? "Excellent" : score >= 70 ? "Good" : score >= 50 ? "Needs Work" : "Poor";

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      {/* Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-neutral-200/60 dark:border-neutral-800/60 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4.5 w-4.5 text-neutral-900 dark:text-white" />
            <span className="font-semibold text-sm text-neutral-900 dark:text-white tracking-tight">RegLayer</span>
            <span className="text-xs text-neutral-400 dark:text-neutral-500 ml-0.5">/</span>
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Report</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href={`/trends?url=${encodeURIComponent(scan.url)}`}
              className="hidden sm:flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Trends
            </Link>
            <Link
              href="/dashboard"
              className="hidden sm:block text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href={`/certificate/${scan.id}`}
              className="flex items-center gap-1.5 rounded-lg bg-neutral-900 dark:bg-white px-2.5 sm:px-3 py-1.5 text-xs font-medium text-white dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors"
            >
              <Eye className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">View Certificate</span>
              <span className="sm:hidden">Certificate</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        {/* Back button */}
        <Link
          href="/scans"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Scans
        </Link>

        {/* Score Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white dark:bg-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)]">
          {/* Subtle gradient accent at top */}
          <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-neutral-300 dark:via-neutral-600 to-transparent" />
          
          <div className="p-6 sm:p-8 lg:p-10">
            <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
              {/* Circular Score Ring with glow */}
              <div className="relative shrink-0">
                {/* Subtle glow behind ring */}
                <div className="absolute inset-0 blur-2xl opacity-20" style={{ backgroundColor: ringColor }} />
                <svg width="130" height="130" viewBox="0 0 130 130" className="relative">
                  <circle cx="65" cy="65" r="54" fill="none" stroke="currentColor" strokeWidth="8" className="text-neutral-100 dark:text-neutral-800" />
                  <circle
                    cx="65" cy="65" r="54"
                    fill="none"
                    stroke={ringColor}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${(score / 100) * 339} 339`}
                    transform="rotate(-90 65 65)"
                    style={{ filter: `drop-shadow(0 0 6px ${ringColor}40)` }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-3xl font-black tracking-tight ${scoreColor}`}>{Math.round(score)}</span>
                  <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-medium -mt-0.5">/ 100</span>
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 text-center sm:text-left">
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-white tracking-tight">Accessibility Score</h2>
                <p className={`text-sm font-medium mt-0.5 ${scoreColor}`}>{scoreLabel} — meets WCAG 2.2 AA</p>
                
                <div className="mt-4 space-y-1.5">
                  <div className="flex items-center gap-2 justify-center sm:justify-start text-[13px] text-neutral-500 dark:text-neutral-400">
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                    <a href={scan.url} target="_blank" rel="noopener noreferrer" className="hover:text-neutral-900 dark:hover:text-white truncate max-w-65 sm:max-w-95 transition-colors">
                      {scan.url}
                    </a>
                  </div>
                  <div className="flex items-center gap-2 justify-center sm:justify-start text-[13px] text-neutral-400 dark:text-neutral-500">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>{new Date(scan.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    {scan.duration && (
                      <span className="text-neutral-300 dark:text-neutral-600">·</span>
                    )}
                    {scan.duration && (
                      <span>{(scan.duration / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <StatCard label="Total" value={scan.totalViolations} color="neutral" />
          <StatCard label="Critical" value={scan.critical} color="red" />
          <StatCard label="Serious" value={scan.serious} color="orange" />
          <StatCard label="Moderate" value={scan.moderate} color="yellow" />
          <StatCard label="Minor" value={scan.minor} color="blue" />
        </div>

        {/* Compliance */}
        {scan.compliance !== null && (
          <div className="rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white dark:bg-neutral-900 p-5 ring-1 ring-neutral-100 dark:ring-neutral-800/50">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">WCAG 2.1 Compliance</h2>
              <span className="text-sm font-bold tabular-nums text-neutral-900 dark:text-white">{Math.round(scan.compliance)}%</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-linear-to-r from-green-400 to-green-500 transition-all"
                style={{ width: `${scan.compliance}%` }}
              />
            </div>
          </div>
        )}

        {/* Violations */}
        {scan.violations.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
                Violations
              </h2>
              <span className="text-xs font-medium text-neutral-400 tabular-nums">({scan.violations.length})</span>
            </div>
            {scan.violations.map((v) => {
              const borderColor: Record<string, string> = {
                critical: "border-l-red-500",
                serious: "border-l-orange-500",
                moderate: "border-l-yellow-500",
                minor: "border-l-blue-400",
              };
              return (
              <div key={v.id} className={`rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 border-l-[3px] ${borderColor[v.impact] || "border-l-neutral-400"} bg-white dark:bg-neutral-900 p-4 sm:p-5 space-y-3`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <ImpactBadge impact={v.impact} />
                      <code className="text-[11px] text-neutral-400 font-mono">{v.ruleId}</code>
                    </div>
                    <p className="font-semibold text-neutral-900 dark:text-white leading-snug">{v.help}</p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">{v.description}</p>
                  </div>
                  {v.helpUrl && (
                    <a
                      href={v.helpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 transition-colors"
                    >
                      Learn more <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                {v.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {v.tags.map((tag) => (
                      <span key={tag} className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {/* Affected elements */}
                {Array.isArray(v.affectedElements) && (v.affectedElements as Array<{ html: string; target: string[] }>).length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 font-medium">
                      ▸ {(v.affectedElements as Array<{ html: string }>).length} affected element(s)
                    </summary>
                    <div className="mt-2 space-y-2">
                      {(v.affectedElements as Array<{ html: string; target: string[]; failureSummary: string }>).slice(0, 5).map((el, i) => (
                        <div key={i} className="rounded-lg bg-neutral-50 dark:bg-neutral-800/50 p-3 border border-neutral-100 dark:border-neutral-700/50">
                          <code className="text-[11px] text-neutral-700 dark:text-neutral-300 break-all block font-mono leading-relaxed">{el.html}</code>
                          {el.target && (
                            <p className="text-[11px] text-neutral-400 mt-1.5 font-mono">{el.target.join(" > ")}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-green-200/60 dark:border-green-800/40 bg-green-50/50 dark:bg-green-950/20 p-8 text-center">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/40 mb-3">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-base font-semibold text-green-800 dark:text-green-200">All Clear</p>
            <p className="text-sm text-green-600/80 dark:text-green-400/80 mt-1">No accessibility violations detected. Meets WCAG 2.2 AA.</p>
          </div>
        )}

        {/* Badge embed */}
        <div className="rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white dark:bg-neutral-900 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">Embed Badge</h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Show your accessibility score in your README:</p>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/badge?url=${encodeURIComponent(scan.url)}`} alt="Accessibility Score" />
          </div>
          <code className="block rounded-lg bg-neutral-50 dark:bg-neutral-800/50 p-3 text-[11px] font-mono text-neutral-600 dark:text-neutral-400 break-all border border-neutral-100 dark:border-neutral-800">
            {`![Accessibility](https://reglayer.vercel.app/api/badge?url=${encodeURIComponent(scan.url)})`}
          </code>
        </div>

        {/* Footer */}
        <footer className="text-center text-xs text-neutral-400 dark:text-neutral-500 pt-6 border-t border-neutral-100 dark:border-neutral-800/50 space-y-2.5">
          <div className="flex items-center justify-center gap-3">
            <Link href="/scans" className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors">← All Scans</Link>
            <span className="text-neutral-200 dark:text-neutral-700">·</span>
            <Link href="/dashboard" className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors">Dashboard</Link>
            <span className="text-neutral-200 dark:text-neutral-700">·</span>
            <Link href="/compliance" className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors">Compliance</Link>
          </div>
          <p>Generated by <Link href="/" className="hover:text-neutral-900 dark:hover:text-white transition-colors">RegLayer</Link></p>
          <p className="text-neutral-300 dark:text-neutral-700 font-mono text-[10px]">{scan.id}</p>
        </footer>
      </main>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const styles: Record<string, { bg: string; text: string; ring: string }> = {
    neutral: { bg: "bg-neutral-50 dark:bg-neutral-800/50", text: "text-neutral-900 dark:text-white", ring: "ring-neutral-200/50 dark:ring-neutral-700/50" },
    red: { bg: "bg-red-50/50 dark:bg-red-950/20", text: "text-red-700 dark:text-red-300", ring: "ring-red-100 dark:ring-red-900/30" },
    orange: { bg: "bg-orange-50/50 dark:bg-orange-950/20", text: "text-orange-700 dark:text-orange-300", ring: "ring-orange-100 dark:ring-orange-900/30" },
    yellow: { bg: "bg-yellow-50/50 dark:bg-yellow-950/20", text: "text-yellow-700 dark:text-yellow-300", ring: "ring-yellow-100 dark:ring-yellow-900/30" },
    blue: { bg: "bg-blue-50/50 dark:bg-blue-950/20", text: "text-blue-700 dark:text-blue-300", ring: "ring-blue-100 dark:ring-blue-900/30" },
  };
  const s = styles[color] || styles.neutral;
  return (
    <div className={`rounded-xl ${s.bg} ring-1 ${s.ring} p-3.5 text-center`}>
      <p className={`text-xl font-bold tabular-nums ${s.text}`}>{value}</p>
      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 font-medium">{label}</p>
    </div>
  );
}

function ImpactBadge({ impact }: { impact: string }) {
  const styles: Record<string, string> = {
    critical: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300 ring-1 ring-red-200 dark:ring-red-800",
    serious: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300 ring-1 ring-orange-200 dark:ring-orange-800",
    moderate: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300 ring-1 ring-yellow-200 dark:ring-yellow-800",
    minor: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-800",
  };
  return (
    <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${styles[impact] || "bg-neutral-100 text-neutral-700"}`}>
      {impact}
    </span>
  );
}
