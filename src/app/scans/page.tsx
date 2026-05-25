"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  GitCompare,
  Share2,
  Clock,
  BarChart3,
  Check,
} from "lucide-react";
import Link from "next/link";

interface ScanRecord {
  id: string;
  url: string;
  score: number | null;
  totalViolations: number;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  compliance: number | null;
  pageTitle: string | null;
  duration: number | null;
  createdAt: string;
  status: string;
}

export default function ScansPage() {
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedScans, setSelectedScans] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/scans")
      .then((r) => r.json())
      .then((data) => {
        setScans(data.scans || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function toggleSelect(id: string) {
    setSelectedScans((prev) =>
      prev.includes(id)
        ? prev.filter((s) => s !== id)
        : prev.length < 2
        ? [...prev, id]
        : [prev[1], id]
    );
  }

  function getTrend(index: number): "up" | "down" | "flat" {
    if (index >= scans.length - 1) return "flat";
    const current = scans[index].score ?? 0;
    const previous = scans[index + 1].score ?? 0;
    if (current > previous) return "up";
    if (current < previous) return "down";
    return "flat";
  }

  const averageScore =
    scans.length > 0
      ? Math.round(scans.reduce((sum, s) => sum + (s.score ?? 0), 0) / scans.length)
      : 0;

  const totalViolationsAll = scans.reduce((sum, s) => sum + s.totalViolations, 0);

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Scan History</h1>
            <p className="mt-1 text-sm text-neutral-500">
              All accessibility scans stored in your database.
            </p>
          </div>
          {selectedScans.length === 2 && (
            <Link
              href={`/scans/compare?base=${selectedScans[0]}&head=${selectedScans[1]}`}
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
            >
              <GitCompare className="h-4 w-4" />
              Compare Selected
            </Link>
          )}
        </div>

        {/* Summary Stats */}
        {scans.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <SummaryCard
              label="Total Scans"
              value={scans.length.toString()}
              icon={<BarChart3 className="h-4 w-4 text-blue-500" />}
            />
            <SummaryCard
              label="Avg Score"
              value={averageScore.toString()}
              icon={<TrendingUp className="h-4 w-4 text-green-500" />}
            />
            <SummaryCard
              label="Total Violations"
              value={totalViolationsAll.toString()}
              icon={<Clock className="h-4 w-4 text-orange-500" />}
            />
            <SummaryCard
              label="Latest Score"
              value={scans[0]?.score?.toString() ?? "—"}
              icon={
                getTrend(0) === "up" ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : getTrend(0) === "down" ? (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                ) : (
                  <Minus className="h-4 w-4 text-neutral-400" />
                )
              }
            />
          </div>
        )}

        {/* Scan List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
          </div>
        ) : scans.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center">
            <BarChart3 className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
            <p className="text-lg font-medium text-neutral-700">No scans yet</p>
            <p className="text-sm text-neutral-500 mt-1">
              Run your first scan from the{" "}
              <Link href="/dashboard" className="text-blue-600 hover:underline">
                Dashboard
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-neutral-400">
              Select 2 scans to compare them side by side
            </p>
            {scans.map((scan, index) => (
              <div
                key={scan.id}
                className={`group rounded-xl border bg-white p-5 transition-all hover:shadow-md ${
                  selectedScans.includes(scan.id)
                    ? "border-blue-300 ring-2 ring-blue-100"
                    : "border-neutral-200"
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleSelect(scan.id)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      selectedScans.includes(scan.id)
                        ? "border-blue-500 bg-blue-500 text-white"
                        : "border-neutral-300 hover:border-blue-400"
                    }`}
                  >
                    {selectedScans.includes(scan.id) && (
                      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 12 12">
                        <path d="M10 3L4.5 8.5 2 6" stroke="currentColor" strokeWidth="2" fill="none" />
                      </svg>
                    )}
                  </button>

                  {/* Score */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-2xl font-bold ${
                        (scan.score ?? 0) >= 90
                          ? "text-green-600"
                          : (scan.score ?? 0) >= 70
                          ? "text-yellow-600"
                          : (scan.score ?? 0) >= 50
                          ? "text-orange-600"
                          : "text-red-600"
                      }`}
                    >
                      {scan.score !== null ? Math.round(scan.score) : "—"}
                    </span>
                    {getTrend(index) === "up" && <TrendingUp className="h-4 w-4 text-green-500" />}
                    {getTrend(index) === "down" && <TrendingDown className="h-4 w-4 text-red-500" />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">
                      {scan.pageTitle || scan.url}
                    </p>
                    <p className="text-xs text-neutral-500 truncate">{scan.url}</p>
                  </div>

                  {/* Violations */}
                  <div className="hidden sm:flex items-center gap-1.5">
                    {scan.critical > 0 && <Badge variant="critical">{scan.critical}</Badge>}
                    {scan.serious > 0 && <Badge variant="serious">{scan.serious}</Badge>}
                    {scan.moderate > 0 && <Badge variant="moderate">{scan.moderate}</Badge>}
                    {scan.minor > 0 && <Badge variant="minor">{scan.minor}</Badge>}
                    {scan.totalViolations === 0 && <Badge variant="success">Clean</Badge>}
                  </div>

                  {/* Meta */}
                  <div className="hidden md:block text-right">
                    <p className="text-xs text-neutral-400">
                      {new Date(scan.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {scan.duration && (
                      <p className="text-xs text-neutral-300">{scan.duration}ms</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link
                      href={`/report/${scan.id}`}
                      className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                      title="View Report"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                    <CopyLinkButton scanId={scan.id} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-xs font-medium text-neutral-500">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-bold text-neutral-900">{value}</p>
    </div>
  );
}

function CopyLinkButton({ scanId }: { scanId: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(`${window.location.origin}/report/${scanId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative">
      <button
        onClick={handleCopy}
        className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors"
        title="Copy Share Link"
      >
        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Share2 className="h-4 w-4" />}
      </button>
      {copied && (
        <span className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-md bg-neutral-900 px-2 py-1 text-xs text-white whitespace-nowrap animate-in fade-in slide-in-from-bottom-1 duration-200">
          Copied!
        </span>
      )}
    </div>
  );
}
