import { prisma } from "@/lib/database/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Shield, ExternalLink, Clock, AlertTriangle, CheckCircle2, ArrowLeft, Download } from "lucide-react";

interface ReportPageProps {
  params: Promise<{ id: string }>;
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

  const score = scan.score ?? 0;
  const scoreColor =
    score >= 90 ? "text-green-600" : score >= 70 ? "text-yellow-600" : score >= 50 ? "text-orange-600" : "text-red-600";
  const scoreBg =
    score >= 90 ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800" : score >= 70 ? "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800" : score >= 50 ? "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800" : "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800";

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      {/* Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/scans"
              className="flex items-center gap-1.5 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to Scans</span>
            </Link>
            <div className="hidden sm:block h-5 w-px bg-neutral-200 dark:bg-neutral-700" />
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-neutral-900 dark:text-white" />
              <span className="font-bold text-neutral-900 dark:text-white">RegLayer</span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-1">Report</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href={`/certificate/${scan.id}`}
              className="flex items-center gap-1.5 rounded-lg bg-neutral-900 dark:bg-white px-3 py-1.5 text-xs font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Certificate
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        {/* Score Hero */}
        <div className={`rounded-2xl border p-8 ${scoreBg}`}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <p className="text-sm font-medium text-neutral-500 mb-1">Accessibility Score</p>
              <p className={`text-6xl font-black ${scoreColor}`}>{Math.round(score)}</p>
              <p className="text-sm text-neutral-500 mt-2">out of 100</p>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-neutral-700">
                <ExternalLink className="h-4 w-4" />
                <a href={scan.url} target="_blank" rel="noopener noreferrer" className="hover:underline truncate max-w-75">
                  {scan.url}
                </a>
              </div>
              <div className="flex items-center gap-2 text-neutral-500">
                <Clock className="h-4 w-4" />
                <span>Scanned {new Date(scan.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              {scan.duration && (
                <p className="text-neutral-400">Completed in {scan.duration}ms</p>
              )}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Total" value={scan.totalViolations} />
          <StatCard label="Critical" value={scan.critical} color="text-red-600" />
          <StatCard label="Serious" value={scan.serious} color="text-orange-600" />
          <StatCard label="Moderate" value={scan.moderate} color="text-yellow-600" />
          <StatCard label="Minor" value={scan.minor} color="text-blue-600" />
        </div>

        {/* Compliance */}
        {scan.compliance !== null && (
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-neutral-900 dark:text-white">WCAG 2.1 Compliance</h2>
              <span className="text-2xl font-bold text-neutral-900 dark:text-white">{Math.round(scan.compliance)}%</span>
            </div>
            <div className="mt-3 h-3 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-linear-to-r from-green-400 to-green-600 transition-all"
                style={{ width: `${scan.compliance}%` }}
              />
            </div>
          </div>
        )}

        {/* Violations */}
        {scan.violations.length > 0 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Violations ({scan.violations.length})
            </h2>
            {scan.violations.map((v) => (
              <div key={v.id} className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <ImpactBadge impact={v.impact} />
                      <code className="text-xs text-neutral-500">{v.ruleId}</code>
                    </div>
                    <p className="font-medium text-neutral-900 dark:text-white">{v.help}</p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{v.description}</p>
                  </div>
                  {v.helpUrl && (
                    <a
                      href={v.helpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-xs text-blue-600 hover:underline"
                    >
                      Learn more
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
                    <summary className="cursor-pointer text-neutral-500 hover:text-neutral-700">
                      {(v.affectedElements as Array<{ html: string }>).length} affected element(s)
                    </summary>
                    <div className="mt-2 space-y-2">
                      {(v.affectedElements as Array<{ html: string; target: string[]; failureSummary: string }>).slice(0, 5).map((el, i) => (
                        <div key={i} className="rounded bg-neutral-50 p-3 border border-neutral-100">
                          <code className="text-xs text-neutral-700 break-all block">{el.html}</code>
                          {el.target && (
                            <p className="text-xs text-neutral-400 mt-1">{el.target.join(" > ")}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="text-lg font-semibold text-green-800">All Clear!</p>
            <p className="text-sm text-green-600 mt-1">No accessibility violations found.</p>
          </div>
        )}

        {/* Badge embed */}
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-6 space-y-3">
          <h3 className="font-semibold text-neutral-900 dark:text-white">Embed Badge</h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Show your accessibility score in your README:</p>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/badge?url=${encodeURIComponent(scan.url)}`} alt="Accessibility Score" />
          </div>
          <code className="block rounded bg-neutral-50 p-3 text-xs text-neutral-600 break-all border border-neutral-100">
            {`![Accessibility](https://reglayer.vercel.app/api/badge?url=${encodeURIComponent(scan.url)})`}
          </code>
        </div>

        {/* Footer */}
        <footer className="text-center text-xs text-neutral-400 pt-8 border-t border-neutral-100 dark:border-neutral-800 space-y-3">
          <div className="flex items-center justify-center gap-4">
            <Link href="/scans" className="text-sm text-blue-600 hover:underline">← All Scans</Link>
            <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">Dashboard</Link>
            <Link href="/compliance" className="text-sm text-blue-600 hover:underline">Compliance</Link>
          </div>
          <p>Generated by <Link href="/" className="hover:underline">RegLayer</Link> — Enterprise Accessibility Intelligence</p>
          <p className="mt-1">Scan ID: {scan.id}</p>
        </footer>
      </main>
    </div>
  );
}

function StatCard({ label, value, color = "text-neutral-900 dark:text-white" }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{label}</p>
    </div>
  );
}

function ImpactBadge({ impact }: { impact: string }) {
  const styles: Record<string, string> = {
    critical: "bg-red-100 text-red-800",
    serious: "bg-orange-100 text-orange-800",
    moderate: "bg-yellow-100 text-yellow-800",
    minor: "bg-blue-100 text-blue-800",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${styles[impact] || "bg-neutral-100 text-neutral-700"}`}>
      {impact}
    </span>
  );
}
