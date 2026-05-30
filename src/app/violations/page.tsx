"use client";

/**
 * RegLayer — Violations Management Page
 *
 * WHY: Users need a dedicated page to manage violations like Sentry issues —
 *      filter by status, bulk-update, see progress at a glance.
 *
 * WHAT: Filter bar (by status) + summary bar (counts) + paginated violation cards
 *       + bulk actions (mark in-progress, won't-fix) + checkbox selection.
 *
 * HOW: Fetches GET /api/violations?scanId=&status=&page= with pagination.
 *      Uses EnhancedViolationCard for each violation. Client-side filter
 *      tabs trigger refetch.
 */

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { EnhancedViolationCard } from "@/components/violations/EnhancedViolationCard";
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Shield,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { ViolationStatus } from "@/generated/prisma/client";
import type { ViolationCardData } from "@/components/violations/EnhancedViolationCard";

// ─────────────── Types ───────────────

interface ViolationsResponse {
  violations: ViolationCardData[];
  summary: Record<string, number>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─────────────── Filter Tabs ───────────────

const STATUS_TABS: Array<{ key: string; label: string; icon: typeof AlertTriangle; color: string }> = [
  { key: "ALL", label: "All", icon: AlertTriangle, color: "text-neutral-600" },
  { key: "OPEN", label: "Open", icon: AlertTriangle, color: "text-red-600" },
  { key: "IN_PROGRESS", label: "In Progress", icon: Clock, color: "text-amber-600" },
  { key: "FIXED", label: "Fixed", icon: CheckCircle2, color: "text-blue-600" },
  { key: "VERIFIED", label: "Verified", icon: CheckCircle2, color: "text-green-600" },
  { key: "EXCEPTIONS", label: "Exceptions", icon: Shield, color: "text-neutral-500" },
];

// ─────────────── Page Component ───────────────

export default function ViolationsPage() {
  const searchParams = useSearchParams();
  const scanIdParam = searchParams.get("scanId") ?? "";

  const [resolvedScanId, setResolvedScanId] = useState(scanIdParam);
  const [data, setData] = useState<ViolationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // If no scanId provided, resolve latest scan
  useEffect(() => {
    if (scanIdParam) {
      setResolvedScanId(scanIdParam);
      return;
    }
    fetch("/api/scans?limit=1")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.scans?.[0]?.id) {
          setResolvedScanId(data.scans[0].id);
        } else {
          setError("No scans found. Run a scan first.");
          setLoading(false);
        }
      })
      .catch(() => {
        setError("Failed to load latest scan.");
        setLoading(false);
      });
  }, [scanIdParam]);

  const fetchViolations = useCallback(async () => {
    if (!resolvedScanId) {
      return;
    }

    setLoading(true);
    setError(null);

    // Map tab to status query
    let statusParam = "";
    if (activeTab === "EXCEPTIONS") {
      statusParam = "WONT_FIX";
    } else if (activeTab !== "ALL") {
      statusParam = activeTab;
    }

    const params = new URLSearchParams({
      scanId: resolvedScanId,
      page: String(currentPage),
      limit: "25",
    });
    if (statusParam) params.set("status", statusParam);

    try {
      const response = await fetch(`/api/violations?${params}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ message: "Failed to load" }));
        throw new Error(errData.message ?? `Error ${response.status}`);
      }
      const result: ViolationsResponse = await response.json();

      // If filtering by exceptions, also fetch ACCEPTABLE_RISK and merge
      if (activeTab === "EXCEPTIONS") {
        const params2 = new URLSearchParams({ scanId: resolvedScanId, page: "1", limit: "100", status: "ACCEPTABLE_RISK" });
        const resp2 = await fetch(`/api/violations?${params2}`);
        if (resp2.ok) {
          const extra: ViolationsResponse = await resp2.json();
          result.violations = [...result.violations, ...extra.violations];
          result.total += extra.total;
        }
      }

      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load violations");
    } finally {
      setLoading(false);
    }
  }, [resolvedScanId, activeTab, currentPage]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching pattern requires setState
    fetchViolations();
  }, [fetchViolations]);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, []);

  const handleCheckbox = useCallback((violationId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(violationId);
      else next.delete(violationId);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (!data) return;
    if (selectedIds.size === data.violations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.violations.map((v) => v.id)));
    }
  }, [data, selectedIds.size]);

  const handleBulkAction = useCallback(
    async (status: ViolationStatus, note?: string) => {
      if (selectedIds.size === 0) return;
      setBulkUpdating(true);

      const promises = [...selectedIds].map((violationId) =>
        fetch("/api/violations/status", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ violationId, status, note }),
        })
      );

      await Promise.allSettled(promises);
      setBulkUpdating(false);
      setSelectedIds(new Set());
      fetchViolations(); // Refresh
    },
    [selectedIds, fetchViolations]
  );

  const handleStatusChange = useCallback(() => {
    // Refresh when a single card's status changes
    fetchViolations();
  }, [fetchViolations]);

  // ─────────────── Summary Counts ───────────────

  const summary = data?.summary ?? {};
  const totalOpen = summary.OPEN ?? 0;
  const totalInProgress = summary.IN_PROGRESS ?? 0;
  const totalFixed = summary.FIXED ?? 0;
  const totalVerified = summary.VERIFIED ?? 0;
  const totalExceptions = (summary.WONT_FIX ?? 0) + (summary.ACCEPTABLE_RISK ?? 0);

  // ─────────────── Render ───────────────

  if (!resolvedScanId && !loading && error) {
    return (
      <AppShell>
        <div className="flex-1 flex items-center justify-center">
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-12 text-center">
            <p className="text-neutral-500">{error}</p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Violations</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Track and manage accessibility issues across your scan
            </p>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <SummaryCard
            label="Open"
            value={totalOpen}
            icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
            active={activeTab === "OPEN"}
            onClick={() => handleTabChange("OPEN")}
          />
          <SummaryCard
            label="In Progress"
            value={totalInProgress}
            icon={<Clock className="h-4 w-4 text-amber-500" />}
            active={activeTab === "IN_PROGRESS"}
            onClick={() => handleTabChange("IN_PROGRESS")}
          />
          <SummaryCard
            label="Fixed"
            value={totalFixed}
            icon={<CheckCircle2 className="h-4 w-4 text-blue-500" />}
            active={activeTab === "FIXED"}
            onClick={() => handleTabChange("FIXED")}
          />
          <SummaryCard
            label="Verified"
            value={totalVerified}
            icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
            active={activeTab === "VERIFIED"}
            onClick={() => handleTabChange("VERIFIED")}
          />
          <SummaryCard
            label="Exceptions"
            value={totalExceptions}
            icon={<Shield className="h-4 w-4 text-neutral-400" />}
            active={activeTab === "EXCEPTIONS"}
            onClick={() => handleTabChange("EXCEPTIONS")}
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 border-b border-neutral-200 dark:border-neutral-700 overflow-x-auto">
          {STATUS_TABS.map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? "border-neutral-900 dark:border-white text-neutral-900 dark:text-white"
                    : "border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                }`}
                aria-selected={isActive}
                role="tab"
              >
                <TabIcon className={`h-3.5 w-3.5 ${isActive ? tab.color : ""}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Bulk Actions (shown when items selected) */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 px-4 py-3">
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              {selectedIds.size} selected
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkAction("IN_PROGRESS" as ViolationStatus)}
              disabled={bulkUpdating}
            >
              Mark In Progress
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkAction("FIXED" as ViolationStatus)}
              disabled={bulkUpdating}
            >
              Mark Fixed
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto"
            >
              Clear Selection
            </Button>
          </div>
        )}

        {/* Select All + Violations List */}
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
          {/* Select All Header */}
          {data && data.violations.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50">
              <input
                type="checkbox"
                checked={selectedIds.size === data.violations.length && data.violations.length > 0}
                onChange={() => handleSelectAll()}
                className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-600 text-neutral-900 focus:ring-neutral-500"
                aria-label="Select all violations"
              />
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Select all on this page
              </span>
              {data.total > 0 && (
                <span className="ml-auto text-xs text-neutral-400">
                  {data.total} violation{data.total !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}

          {/* Violations List */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 dark:border-neutral-600 border-t-neutral-900 dark:border-t-white" />
            </div>
          ) : error ? (
            <div className="text-center py-16 px-4">
              <p className="text-red-500 font-medium text-sm">{error}</p>
            </div>
          ) : data && data.violations.length === 0 ? (
            <div className="text-center py-16 px-4">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
              <p className="text-neutral-600 dark:text-neutral-300 font-medium">
                No violations in this category
              </p>
              <p className="text-sm text-neutral-400 mt-1">
                {activeTab === "ALL" ? "This scan has no violations. Great job!" : "Try a different filter."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {data?.violations.map((violation) => (
                <div key={violation.id} className="flex items-start gap-3 p-4 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(violation.id)}
                    onChange={(e) => handleCheckbox(violation.id, e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-neutral-300 dark:border-neutral-600 text-neutral-900 focus:ring-neutral-500"
                    aria-label={`Select violation: ${violation.help}`}
                  />
                  <div className="flex-1 min-w-0">
                    <EnhancedViolationCard
                      violation={violation}
                      onStatusChange={handleStatusChange}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-neutral-500">
              Page {data.page} of {data.totalPages} ({data.total} total)
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="gap-1"
              >
                <ChevronLeft className="h-3 w-3" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={currentPage >= data.totalPages}
                className="gap-1"
              >
                Next
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

// ─────────────── Sub Components ───────────────

function SummaryCard({
  label,
  value,
  icon,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition-all hover:shadow-sm ${
        active
          ? "border-neutral-900 dark:border-white bg-white dark:bg-neutral-900 ring-1 ring-neutral-900 dark:ring-white"
          : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-600"
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-bold text-neutral-900 dark:text-white">{value}</p>
    </button>
  );
}
