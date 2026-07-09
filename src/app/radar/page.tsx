/**
 * RegLayer — Regulatory Radar Page
 *
 * Predictive compliance forecasting: shows which regulations you're ready for,
 * which you're not, and exactly what to fix before each deadline.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Radar,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Zap,
  Target,
  Scale,
  Loader2,
  Globe,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FailingCriterion {
  criterion: string;
  title: string;
  violationCount: number;
  impact: "critical" | "serious" | "moderate" | "minor";
  sampleRuleIds: string[];
}

interface RadarRegulation {
  id: string;
  name: string;
  shortName: string;
  jurisdiction: string;
  region: string;
  readiness: number;
  status: "compliant" | "at-risk" | "non-compliant";
  daysUntilEnforcement: number | null;
  enforcementDate: string | null;
  failingCriteria: FailingCriterion[];
  estimatedEffort: {
    totalViolations: number;
    criticalCount: number;
    estimatedHours: number;
    complexity: "low" | "medium" | "high";
  };
  penalties: {
    maxFine: string;
    privateRightOfAction: boolean;
  };
}

interface RadarSummary {
  overallReadiness: number;
  regulationsAtRisk: number;
  regulationsCompliant: number;
  criticalDeadlines: number;
  topPriority: string | null;
}

interface RadarData {
  summary: RadarSummary;
  regulations: RadarRegulation[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

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

const STATUS_STYLES = {
  compliant: {
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    border: "border-emerald-200 dark:border-emerald-800",
    text: "text-emerald-700 dark:text-emerald-400",
    icon: ShieldCheck,
    label: "Compliant",
  },
  "at-risk": {
    bg: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-200 dark:border-amber-800",
    text: "text-amber-700 dark:text-amber-400",
    icon: ShieldAlert,
    label: "At Risk",
  },
  "non-compliant": {
    bg: "bg-red-50 dark:bg-red-900/20",
    border: "border-red-200 dark:border-red-800",
    text: "text-red-700 dark:text-red-400",
    icon: AlertTriangle,
    label: "Non-Compliant",
  },
};

const IMPACT_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  serious: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  moderate: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  minor: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

// ─── Page Component ──────────────────────────────────────────────────────────

export default function RadarPage() {
  const [data, setData] = useState<RadarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [geo, setGeo] = useState("GLOBAL");
  const [industry, setIndustry] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ geos: geo });
      if (industry) params.set("industry", industry);
      const res = await fetch(`/api/regulations/radar?${params}`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch {
      // Silently handle errors
    } finally {
      setLoading(false);
    }
  }, [geo, industry]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Radar className="h-6 w-6 text-violet-500" />
              Regulatory Radar
            </h1>
            <p className="text-neutral-500 dark:text-neutral-400 mt-1">
              Predict compliance gaps before enforcement deadlines hit
            </p>
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <select
              value={geo}
              onChange={(e) => setGeo(e.target.value)}
              className="px-3 py-2 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 text-sm"
            >
              {GEO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="px-3 py-2 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 text-sm"
            >
              {INDUSTRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center min-h-[300px]">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
          </div>
        ) : data ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <SummaryCard
                label="Overall Readiness"
                value={`${data.summary.overallReadiness}%`}
                icon={<Target className="h-5 w-5 text-violet-500" />}
                color={
                  data.summary.overallReadiness >= 90
                    ? "text-emerald-600"
                    : data.summary.overallReadiness >= 70
                    ? "text-amber-600"
                    : "text-red-600"
                }
              />
              <SummaryCard
                label="Regulations at Risk"
                value={String(data.summary.regulationsAtRisk)}
                icon={<ShieldAlert className="h-5 w-5 text-amber-500" />}
              />
              <SummaryCard
                label="Fully Compliant"
                value={String(data.summary.regulationsCompliant)}
                icon={<ShieldCheck className="h-5 w-5 text-emerald-500" />}
              />
              <SummaryCard
                label="Critical Deadlines"
                value={String(data.summary.criticalDeadlines)}
                subtitle="within 90 days"
                icon={<Clock className="h-5 w-5 text-red-500" />}
              />
            </div>

            {/* Regulation Cards */}
            <div className="space-y-3">
              {data.regulations.map((reg) => (
                <RegulationCard
                  key={reg.id}
                  regulation={reg}
                  expanded={expanded === reg.id}
                  onToggle={() => setExpanded(expanded === reg.id ? null : reg.id)}
                />
              ))}
            </div>

            {data.regulations.length === 0 && (
              <div className="text-center py-12 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl">
                <Globe className="h-10 w-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
                <p className="text-neutral-500">No applicable regulations found for selected filters.</p>
              </div>
            )}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  subtitle,
  icon,
  color,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 bg-white dark:bg-neutral-900">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-neutral-500 uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color || ""}`}>{value}</p>
      {subtitle && <p className="text-xs text-neutral-500">{subtitle}</p>}
    </div>
  );
}

function RegulationCard({
  regulation,
  expanded,
  onToggle,
}: {
  regulation: RadarRegulation;
  expanded: boolean;
  onToggle: () => void;
}) {
  const style = STATUS_STYLES[regulation.status];
  const StatusIcon = style.icon;

  return (
    <div className={`border ${style.border} rounded-xl overflow-hidden ${style.bg}`}>
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <StatusIcon className={`h-5 w-5 ${style.text}`} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{regulation.shortName}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.text} ${style.bg}`}>
                {style.label}
              </span>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{regulation.jurisdiction}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Readiness bar */}
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-24 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  regulation.readiness >= 90
                    ? "bg-emerald-500"
                    : regulation.readiness >= 70
                    ? "bg-amber-500"
                    : "bg-red-500"
                }`}
                style={{ width: `${regulation.readiness}%` }}
              />
            </div>
            <span className="text-sm font-medium w-10 text-right">{regulation.readiness}%</span>
          </div>

          {/* Deadline countdown */}
          {regulation.daysUntilEnforcement !== null && (
            <span className="text-xs text-neutral-500 whitespace-nowrap">
              {regulation.daysUntilEnforcement} days
            </span>
          )}

          {expanded ? (
            <ChevronDown className="h-4 w-4 text-neutral-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-neutral-400" />
          )}
        </div>
      </button>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-neutral-200/50 dark:border-neutral-700/50 pt-3">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MiniStat
              label="Failing Criteria"
              value={String(regulation.failingCriteria.length)}
              icon={<AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
            />
            <MiniStat
              label="Total Violations"
              value={String(regulation.estimatedEffort.totalViolations)}
              icon={<Shield className="h-3.5 w-3.5 text-orange-500" />}
            />
            <MiniStat
              label="Est. Effort"
              value={`${regulation.estimatedEffort.estimatedHours}h`}
              icon={<Zap className="h-3.5 w-3.5 text-amber-500" />}
            />
            <MiniStat
              label="Max Penalty"
              value={regulation.penalties.maxFine.split(" ")[0]}
              icon={<Scale className="h-3.5 w-3.5 text-red-500" />}
            />
          </div>

          {/* Failing Criteria List */}
          {regulation.failingCriteria.length > 0 ? (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">
                Criteria to Fix Before Deadline
              </h4>
              <div className="space-y-1.5">
                {regulation.failingCriteria.slice(0, 8).map((fc) => (
                  <div
                    key={fc.criterion}
                    className="flex items-center justify-between py-1.5 px-2 rounded bg-white/60 dark:bg-neutral-800/60"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${IMPACT_STYLES[fc.impact]}`}>
                        {fc.impact}
                      </span>
                      <span className="text-sm font-mono">{fc.criterion}</span>
                      <span className="text-sm text-neutral-600 dark:text-neutral-400">{fc.title}</span>
                    </div>
                    <span className="text-xs text-neutral-500">{fc.violationCount} issue{fc.violationCount !== 1 ? "s" : ""}</span>
                  </div>
                ))}
                {regulation.failingCriteria.length > 8 && (
                  <p className="text-xs text-neutral-500 pl-2">
                    + {regulation.failingCriteria.length - 8} more criteria
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="h-4 w-4" />
              All required WCAG criteria are passing for this regulation.
            </div>
          )}

          {/* Enforcement & Penalties */}
          <div className="flex items-center gap-4 text-xs text-neutral-500 pt-1 border-t border-neutral-200/50 dark:border-neutral-700/50">
            {regulation.enforcementDate && (
              <span>Enforcement: {new Date(regulation.enforcementDate).toLocaleDateString()}</span>
            )}
            {regulation.penalties.privateRightOfAction && (
              <span className="text-red-600 dark:text-red-400 font-medium">⚠ Private lawsuits possible</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <div>
        <p className="text-sm font-semibold">{value}</p>
        <p className="text-xs text-neutral-500">{label}</p>
      </div>
    </div>
  );
}
