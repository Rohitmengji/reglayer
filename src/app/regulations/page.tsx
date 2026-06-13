/**
 * RegLayer — Regulation Deadline Intelligence Page
 *
 * WHY: Compliance teams need a single view of all upcoming regulatory deadlines.
 * WHAT: Timeline view of regulations with urgency indicators and recommendations.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { ModernSelect } from "@/components/ui/modern-select";
import { useI18n } from "@/components/i18n-provider";
import {
  Calendar,
  AlertTriangle,
  Clock,
  Globe,
  Scale,
  ChevronDown,
  ExternalLink,
  Bell,
} from "lucide-react";

interface DeadlineAlert {
  regulation: string;
  regulationId: string;
  deadline: {
    id: string;
    title: string;
    date: string;
    description: string;
    severity: string;
    status: string;
  };
  daysUntil: number;
  urgency: "overdue" | "imminent" | "soon" | "upcoming" | "future";
  recommendation: string;
}

interface RegulationInfo {
  id: string;
  name: string;
  shortName: string;
  jurisdiction: string;
  region: string;
  description: string;
  url: string;
  penalties: {
    maxFine: string;
    enforcementBody: string;
    privateRightOfAction: boolean;
    typicalSettlement?: string;
  };
}

const URGENCY_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  overdue: { bg: "bg-red-50 dark:bg-red-900/20", text: "text-red-700 dark:text-red-300", border: "border-red-200 dark:border-red-800", label: "OVERDUE" },
  imminent: { bg: "bg-orange-50 dark:bg-orange-900/20", text: "text-orange-700 dark:text-orange-300", border: "border-orange-200 dark:border-orange-800", label: "IMMINENT" },
  soon: { bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800", label: "SOON" },
  upcoming: { bg: "bg-blue-50 dark:bg-blue-900/20", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200 dark:border-blue-800", label: "UPCOMING" },
  future: { bg: "bg-gray-50 dark:bg-gray-800", text: "text-gray-600 dark:text-gray-400", border: "border-gray-200 dark:border-gray-700", label: "FUTURE" },
};

const GEO_OPTIONS = [
  { value: "GLOBAL", label: "Global (All)" },
  { value: "US", label: "United States" },
  { value: "EU", label: "European Union" },
  { value: "UK", label: "United Kingdom" },
  { value: "CA", label: "Canada" },
  { value: "AU", label: "Australia" },
];

const INDUSTRY_OPTIONS = [
  { value: "", label: "All Industries" },
  { value: "ecommerce", label: "E-Commerce" },
  { value: "government", label: "Government" },
  { value: "education", label: "Education" },
  { value: "healthcare", label: "Healthcare" },
  { value: "financial", label: "Financial Services" },
  { value: "saas", label: "SaaS / Technology" },
];

export default function RegulationsPage() {
  const { t } = useI18n();
  const [deadlines, setDeadlines] = useState<DeadlineAlert[]>([]);
  const [regulations, setRegulations] = useState<RegulationInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [geo, setGeo] = useState("GLOBAL");
  const [industry, setIndustry] = useState("");
  const [expandedReg, setExpandedReg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ geos: geo });
      if (industry) params.set("industry", industry);
      const res = await fetch(`/api/regulations?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setDeadlines(data.deadlines);
      setRegulations(data.regulations);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [geo, industry]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: kick off the initial client-side data fetch (sets loading state synchronously)
    loadData();
  }, [loadData]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
            <Scale className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t("regulations.title")}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("regulations.subtitle")}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="relative">
          <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
          <ModernSelect
              options={GEO_OPTIONS}
              value={geo}
              onChange={setGeo}
            />
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
        </div>
        <div className="relative">
          <ModernSelect
              options={INDUSTRY_OPTIONS}
              value={industry}
              onChange={setIndustry}
            />
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
        </div>
      </div>

      {/* Summary Cards */}
      {!loading && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
            <div className="text-xs font-medium text-red-600 dark:text-red-400">Overdue</div>
            <div className="text-xl font-bold text-red-700 dark:text-red-300">
              {deadlines.filter((d) => d.urgency === "overdue").length}
            </div>
          </div>
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-900/20">
            <div className="text-xs font-medium text-orange-600 dark:text-orange-400">Imminent (&lt;30d)</div>
            <div className="text-xl font-bold text-orange-700 dark:text-orange-300">
              {deadlines.filter((d) => d.urgency === "imminent").length}
            </div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
            <div className="text-xs font-medium text-amber-600 dark:text-amber-400">Soon (&lt;90d)</div>
            <div className="text-xl font-bold text-amber-700 dark:text-amber-300">
              {deadlines.filter((d) => d.urgency === "soon").length}
            </div>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
            <div className="text-xs font-medium text-blue-600 dark:text-blue-400">Upcoming</div>
            <div className="text-xl font-bold text-blue-700 dark:text-blue-300">
              {deadlines.filter((d) => d.urgency === "upcoming" || d.urgency === "future").length}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Deadline Timeline */}
          <div className="mb-8 space-y-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Deadline Timeline
            </h2>
            {deadlines.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No applicable deadlines for selected filters.
              </p>
            ) : (
              deadlines.map((alert) => {
                const style = URGENCY_STYLES[alert.urgency];
                return (
                  <div
                    key={alert.deadline.id}
                    className={`rounded-lg border p-4 ${style.border} ${style.bg}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {alert.urgency === "overdue" || alert.urgency === "imminent" ? (
                            <AlertTriangle className={`h-4 w-4 shrink-0 ${style.text}`} />
                          ) : (
                            <Calendar className={`h-4 w-4 shrink-0 ${style.text}`} />
                          )}
                          <span className={`text-sm font-semibold ${style.text}`}>
                            {alert.regulation}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${style.text} ${style.bg}`}>
                            {style.label}
                          </span>
                        </div>
                        <h3 className="mt-1 font-medium text-gray-900 dark:text-white">
                          {alert.deadline.title}
                        </h3>
                        <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">
                          {alert.deadline.description}
                        </p>
                        <div className="mt-2 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {alert.daysUntil < 0
                              ? `${Math.abs(alert.daysUntil)} days overdue`
                              : `${alert.daysUntil} days remaining`}
                          </span>
                          <span>
                            {new Date(alert.deadline.date).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                        <p className="mt-2 text-sm italic text-gray-600 dark:text-gray-300">
                          <Bell className="mr-1 inline h-3 w-3" />
                          {alert.recommendation}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Regulation Details */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Applicable Regulations
            </h2>
            {regulations.map((reg) => (
              <div
                key={reg.id}
                className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
              >
                <button
                  onClick={() => setExpandedReg(expandedReg === reg.id ? null : reg.id)}
                  className="flex w-full items-center justify-between p-4 text-left"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Scale className="h-4 w-4 text-purple-600" />
                      <span className="font-medium text-gray-900 dark:text-white">
                        {reg.shortName}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        — {reg.jurisdiction}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                      {reg.description}
                    </p>
                  </div>
                  <ChevronDown
                    className={`h-5 w-5 text-gray-500 dark:text-gray-400 transition-transform ${expandedReg === reg.id ? "rotate-180" : ""}`}
                  />
                </button>
                {expandedReg === reg.id && (
                  <div className="border-t border-gray-200 p-4 dark:border-gray-700">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <h4 className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                          Penalties
                        </h4>
                        <p className="mt-1 text-sm text-gray-900 dark:text-white">
                          Max Fine: {reg.penalties.maxFine}
                        </p>
                        {reg.penalties.typicalSettlement && (
                          <p className="text-sm text-gray-600 dark:text-gray-300">
                            Typical Settlement: {reg.penalties.typicalSettlement}
                          </p>
                        )}
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          Private Right of Action: {reg.penalties.privateRightOfAction ? "Yes" : "No"}
                        </p>
                      </div>
                      <div>
                        <h4 className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                          Enforcement
                        </h4>
                        <p className="mt-1 text-sm text-gray-900 dark:text-white">
                          {reg.penalties.enforcementBody}
                        </p>
                        <a
                          href={reg.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
                        >
                          Official Source <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
