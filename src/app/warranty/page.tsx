/**
 * RegLayer — Warranty Dashboard Page
 *
 * Displays warranty policy status, eligibility indicators, coverage details,
 * and claim history. Enterprise-only feature.
 */
"use client";

import { useState, useEffect } from "react";
import { Shield, ShieldCheck, ShieldAlert, ShieldX, Clock, AlertTriangle, CheckCircle2, FileWarning } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { useI18n } from "@/components/i18n-provider";

interface WarrantyPolicy {
  id: string;
  tier: string;
  status: string;
  coverageLimit: number;
  scoreFloor: number;
  monthlyPremium: number;
  enrolledAt: string;
  activatedAt: string | null;
  expiresAt: string | null;
  siteId: string;
  currentScore: number | null;
  consecutiveDaysAboveFloor: number;
  suspensionCount: number;
}

interface EligibilityVerdict {
  eligible: boolean;
  status: string;
  reasons: string[];
  currentScore: number | null;
  consecutiveDaysAboveFloor: number;
  monitoringGapDetected: boolean;
  lastScanAge: { hours: number } | null;
  qualifyingProgress: number;
}

interface WarrantyClaim {
  id: string;
  status: string;
  claimType: string;
  incidentDate: string;
  coveredAmount: number | null;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { icon: typeof Shield; color: string; label: string }> = {
  ACTIVE: { icon: ShieldCheck, color: "text-emerald-600 dark:text-emerald-400", label: "Active — Covered" },
  PENDING: { icon: Clock, color: "text-amber-600 dark:text-amber-400", label: "Qualifying Period" },
  SUSPENDED: { icon: ShieldAlert, color: "text-red-600 dark:text-red-400", label: "Suspended" },
  CANCELLED: { icon: ShieldX, color: "text-neutral-500", label: "Cancelled" },
  EXPIRED: { icon: ShieldX, color: "text-neutral-500", label: "Expired" },
};

const TIER_LABELS: Record<string, string> = {
  SHIELD: "Shield",
  FORTRESS: "Fortress",
  VAULT: "Vault",
};

export default function WarrantyPage() {
  const { t } = useI18n();
  const [policies, setPolicies] = useState<WarrantyPolicy[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState<string | null>(null);
  const [eligibility, setEligibility] = useState<EligibilityVerdict | null>(null);
  const [claims, setClaims] = useState<WarrantyClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/warranty");
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Failed to load warranty data");
          return;
        }
        const data = await res.json();
        setPolicies(data.policies || []);
        if (data.policies?.length > 0) {
          setSelectedPolicy(data.policies[0].id);
        }
      } catch {
        setError("Failed to load warranty data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Load eligibility when policy selected
  useEffect(() => {
    if (!selectedPolicy) return;
    async function loadStatus() {
      try {
        const res = await fetch(`/api/warranty/${selectedPolicy}`);
        if (res.ok) {
          const data = await res.json();
          setEligibility(data.eligibility);
        }
      } catch { /* non-critical */ }
    }
    async function loadClaims() {
      try {
        const res = await fetch(`/api/warranty/${selectedPolicy}/claim`);
        if (res.ok) {
          const data = await res.json();
          setClaims(data.claims || []);
        }
      } catch { /* non-critical */ }
    }
    loadStatus();
    loadClaims();
  }, [selectedPolicy]);

  const activePolicy = policies.find((p) => p.id === selectedPolicy);
  const statusConfig = activePolicy ? STATUS_CONFIG[activePolicy.status] || STATUS_CONFIG.CANCELLED : null;

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-3">
              <Shield className="h-7 w-7 text-indigo-600" />
              Compliance Warranty
            </h1>
            <p className="mt-1 text-neutral-500 dark:text-neutral-400">
              Financial coverage backed by continuous accessibility monitoring
            </p>
          </div>
        </div>

        {loading && (
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-neutral-100 dark:bg-neutral-800 rounded-xl" />
            <div className="h-64 bg-neutral-100 dark:bg-neutral-800 rounded-xl" />
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-6">
            <p className="text-red-700 dark:text-red-400 font-medium">{error}</p>
            {error.includes("Enterprise") && (
              <a href="/pricing" className="mt-2 inline-block text-sm text-indigo-600 hover:underline">
                View Enterprise plan →
              </a>
            )}
          </div>
        )}

        {!loading && !error && policies.length === 0 && (
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-12 text-center">
            <Shield className="h-12 w-12 text-neutral-300 dark:text-neutral-600 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">No Warranty Policies</h2>
            <p className="mt-2 text-neutral-500 dark:text-neutral-400 max-w-md mx-auto">
              Enroll a site in the Compliance Warranty program to get financial coverage backed by your accessibility monitoring data.
            </p>
          </div>
        )}

        {activePolicy && statusConfig && (
          <>
            {/* Status Card */}
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800 ${statusConfig.color}`}>
                    <statusConfig.icon className="h-8 w-8" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                        {TIER_LABELS[activePolicy.tier]} Tier
                      </span>
                    </div>
                    <p className={`text-lg font-bold ${statusConfig.color}`}>
                      {statusConfig.label}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-neutral-900 dark:text-white">
                    ${(activePolicy.coverageLimit / 100).toLocaleString()}
                  </p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">maximum coverage</p>
                </div>
              </div>

              {/* Qualifying Progress */}
              {eligibility && activePolicy.status === "PENDING" && (
                <div className="mt-6">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-neutral-600 dark:text-neutral-400">Qualifying Period</span>
                    <span className="font-medium text-neutral-900 dark:text-white">
                      {eligibility.qualifyingProgress}%
                    </span>
                  </div>
                  <div className="h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{ width: `${eligibility.qualifyingProgress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-neutral-500">
                    Maintain score ≥ {activePolicy.scoreFloor} for 30 consecutive days to activate coverage
                  </p>
                </div>
              )}
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                label="Current Score"
                value={eligibility?.currentScore?.toString() ?? "—"}
                subtitle={`Floor: ${activePolicy.scoreFloor}`}
                ok={eligibility ? (eligibility.currentScore ?? 0) >= activePolicy.scoreFloor : false}
              />
              <MetricCard
                label="Days Above Floor"
                value={eligibility?.consecutiveDaysAboveFloor.toString() ?? "0"}
                subtitle="Consecutive"
                ok={(eligibility?.consecutiveDaysAboveFloor ?? 0) >= 30}
              />
              <MetricCard
                label="Last Scan"
                value={eligibility?.lastScanAge ? `${eligibility.lastScanAge.hours}h ago` : "—"}
                subtitle={`Max gap: ${activePolicy.scoreFloor}h`}
                ok={!eligibility?.monitoringGapDetected}
              />
              <MetricCard
                label="Premium"
                value={`$${(activePolicy.monthlyPremium / 100).toFixed(0)}/mo`}
                subtitle={`${activePolicy.suspensionCount} suspension(s)`}
                ok={activePolicy.suspensionCount === 0}
              />
            </div>

            {/* Eligibility Reasons */}
            {eligibility && eligibility.reasons.length > 0 && (
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-6">
                <h3 className="font-semibold text-neutral-900 dark:text-white mb-3">
                  Eligibility Status
                </h3>
                <ul className="space-y-2">
                  {eligibility.reasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      {eligibility.eligible ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      )}
                      <span className="text-neutral-700 dark:text-neutral-300">{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Claims History */}
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-neutral-900 dark:text-white">Claims</h3>
                {activePolicy.status === "ACTIVE" && (
                  <a
                    href={`/demand-letter?policyId=${activePolicy.id}`}
                    className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    File a Claim →
                  </a>
                )}
              </div>
              {claims.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">No claims filed</p>
              ) : (
                <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {claims.map((claim) => (
                    <div key={claim.id} className="py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-neutral-900 dark:text-white">
                          {claim.claimType.replace("_", " ")}
                        </p>
                        <p className="text-xs text-neutral-500">
                          Incident: {new Date(claim.incidentDate).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <ClaimStatusBadge status={claim.status} />
                        {claim.coveredAmount && (
                          <p className="text-xs text-neutral-500 mt-1">
                            ${(claim.coveredAmount / 100).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function MetricCard({ label, value, subtitle, ok }: { label: string; value: string; subtitle: string; ok: boolean }) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-1 ${ok ? "text-neutral-900 dark:text-white" : "text-red-600 dark:text-red-400"}`}>
        {value}
      </p>
      <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>
    </div>
  );
}

function ClaimStatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    SUBMITTED: { bg: "bg-blue-50 dark:bg-blue-950/30", text: "text-blue-700 dark:text-blue-300", label: "Submitted" },
    UNDER_REVIEW: { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-300", label: "Under Review" },
    APPROVED: { bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-300", label: "Approved" },
    DENIED: { bg: "bg-red-50 dark:bg-red-950/30", text: "text-red-700 dark:text-red-300", label: "Denied" },
    RESOLVED: { bg: "bg-neutral-100 dark:bg-neutral-800", text: "text-neutral-600 dark:text-neutral-400", label: "Resolved" },
  };
  const c = config[status] || config.SUBMITTED;
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}
