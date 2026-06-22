/**
 * RegLayer — CI/CD Regression Guard Page
 *
 * WHY: Teams need visibility into guard policies and their pass/fail history.
 * WHAT: Lists guard policies, shows baseline info, and allows policy management.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/components/i18n-provider";
import { AppShell } from "@/components/layout/app-shell";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  ShieldCheck,
  ShieldAlert,
  Plus,
  Settings2,
  Trash2,
  RefreshCw,
  GitBranch,
  Target,
  TrendingDown,
  AlertTriangle,
} from "lucide-react";

interface GuardPolicyView {
  id: string;
  name: string;
  enabled: boolean;
  minScore: number;
  maxCritical: number;
  maxSerious: number;
  maxScoreDrop: number;
  maxNewViolations: number;
  autoPromoteBaseline: boolean;
  baselineScore: number | null;
  baselineLockedAt: string | null;
  site: { id: string; url: string; name: string | null };
}

export default function GuardPage() {
  const { t } = useI18n();
  const [policies, setPolicies] = useState<GuardPolicyView[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sites, setSites] = useState<{ id: string; url: string; name: string | null }[]>([]);
  const [form, setForm] = useState({
    siteId: "",
    name: "",
    minScore: 80,
    maxCritical: 0,
    maxSerious: 3,
    maxScoreDrop: 5,
    maxNewViolations: 5,
    autoPromoteBaseline: true,
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadPolicies = useCallback(async () => {
    try {
      const wsRes = await fetch("/api/workspaces/current");
      if (!wsRes.ok) return;
      const { workspace } = await wsRes.json();

      const res = await fetch(`/api/guard?workspaceId=${workspace.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setPolicies(data.policies);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSites = useCallback(async () => {
    try {
      const res = await fetch("/api/sites");
      if (!res.ok) return;
      const data = await res.json();
      setSites(data.sites ?? []);
    } catch {
      // ignore — the select will simply show no options
    }
  }, []);

  const createPolicy = async () => {
    if (!form.siteId || !form.name.trim()) {
      setCreateError("Pick a site and enter a policy name.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const wsRes = await fetch("/api/workspaces/current");
      if (!wsRes.ok) throw new Error("workspace-failed");
      const { workspace } = await wsRes.json();
      const res = await fetch("/api/guard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, workspaceId: workspace.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(typeof err?.error === "string" ? err.error : "create-failed");
      }
      setShowCreate(false);
      setForm({ siteId: "", name: "", minScore: 80, maxCritical: 0, maxSerious: 3, maxScoreDrop: 5, maxNewViolations: 5, autoPromoteBaseline: true });
      await loadPolicies();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setCreateError(
        msg && msg !== "workspace-failed" && msg !== "create-failed"
          ? msg
          : "Couldn't create the policy. Please try again."
      );
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: kick off the initial client-side data fetch (sets loading state synchronously)
    loadPolicies();
  }, [loadPolicies]);

  const togglePolicy = async (policyId: string, enabled: boolean) => {
    setActionError(null);
    try {
      const res = await fetch(`/api/guard/${policyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("toggle failed");
      setPolicies((prev) =>
        prev.map((p) => (p.id === policyId ? { ...p, enabled } : p))
      );
    } catch {
      setActionError(
        enabled
          ? "Couldn't enable the policy. Please try again."
          : "Couldn't disable the policy. Please try again."
      );
    }
  };

  const deletePolicy = async (policyId: string) => {
    setActionError(null);
    try {
      const res = await fetch(`/api/guard/${policyId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      setPolicies((prev) => prev.filter((p) => p.id !== policyId));
    } catch {
      setActionError("Couldn't delete the policy. Please try again.");
    } finally {
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-neutral-200 border-t-neutral-900 dark:border-neutral-700 dark:border-t-white" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-8">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
            <ShieldAlert className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white">
              {t("guard.title")}
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {t("guard.subtitle")}
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            const next = !showCreate;
            setShowCreate(next);
            setCreateError(null);
            if (next && sites.length === 0) void loadSites();
          }}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          {showCreate ? "Close" : "New Policy"}
        </button>
      </div>

      {/* How it works */}
      <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <h3 className="text-sm font-medium text-blue-900 dark:text-blue-200">
          How Regression Guard Works
        </h3>
        <div className="mt-2 grid grid-cols-1 gap-3 text-sm text-blue-800 dark:text-blue-300 sm:grid-cols-3">
          <div className="flex items-start gap-2">
            <GitBranch className="mt-0.5 h-4 w-4 shrink-0" />
            <span>CI pipeline triggers scan on PR preview URL</span>
          </div>
          <div className="flex items-start gap-2">
            <Target className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Guard evaluates scan against locked baseline</span>
          </div>
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Returns pass/fail verdict for CI gate decision</span>
          </div>
        </div>
      </div>

      {actionError && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
          role="alert"
        >
          {actionError}
        </div>
      )}

      {/* Create Policy form */}
      {showCreate && (
        <div className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-800">
          <h3 className="mb-4 text-sm font-semibold text-neutral-900 dark:text-white">
            New Guard Policy
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Site
              <select
                value={form.siteId}
                onChange={(e) => setForm((f) => ({ ...f, siteId: e.target.value }))}
                className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-white"
              >
                <option value="">Select a site…</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || new URL(s.url).hostname}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Policy name
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Production gate"
                className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 dark:border-neutral-600 dark:bg-neutral-900 dark:text-white"
              />
            </label>
            <NumberField label="Min score" value={form.minScore} min={0} max={100} onChange={(v) => setForm((f) => ({ ...f, minScore: v }))} />
            <NumberField label="Max score drop (pts)" value={form.maxScoreDrop} min={0} max={100} onChange={(v) => setForm((f) => ({ ...f, maxScoreDrop: v }))} />
            <NumberField label="Max critical" value={form.maxCritical} min={0} onChange={(v) => setForm((f) => ({ ...f, maxCritical: v }))} />
            <NumberField label="Max serious" value={form.maxSerious} min={0} onChange={(v) => setForm((f) => ({ ...f, maxSerious: v }))} />
            <NumberField label="Max new violations" value={form.maxNewViolations} min={0} onChange={(v) => setForm((f) => ({ ...f, maxNewViolations: v }))} />
          </div>
          <label className="mt-4 flex items-center gap-2 text-xs font-medium text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={form.autoPromoteBaseline}
              onChange={(e) => setForm((f) => ({ ...f, autoPromoteBaseline: e.target.checked }))}
              className="h-4 w-4 rounded border-neutral-300 text-blue-600"
            />
            Auto-promote a new baseline when a scan passes
          </label>
          {sites.length === 0 && (
            <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
              No sites yet — run a scan first to create a site you can guard.
            </p>
          )}
          {createError && (
            <p className="mt-3 text-xs text-red-600 dark:text-red-400" role="alert">{createError}</p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={createPolicy}
              disabled={creating}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create policy"}
            </button>
            <button
              onClick={() => { setShowCreate(false); setCreateError(null); }}
              className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Policy List */}
      {policies.length === 0 && !showCreate ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-6 sm:p-12 text-center dark:border-neutral-600 dark:bg-neutral-800/50">
          <ShieldAlert className="mx-auto mb-3 h-12 w-12 text-neutral-500 dark:text-neutral-400" />
          <h3 className="text-lg font-medium text-neutral-900 dark:text-white">
            No guard policies yet
          </h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Create a policy to start blocking deployments when accessibility quality drops.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {policies.map((policy) => (
            <div
              key={policy.id}
              className={`rounded-lg border p-5 transition-shadow hover:shadow-sm ${
                policy.enabled
                  ? "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800"
                  : "border-neutral-100 bg-neutral-50 opacity-60 dark:border-neutral-800 dark:bg-neutral-900"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {policy.enabled ? (
                      <ShieldCheck className="h-4 w-4 shrink-0 text-green-600" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 shrink-0 text-neutral-500 dark:text-neutral-400" />
                    )}
                    <h3 className="font-semibold text-neutral-900 dark:text-white truncate">
                      {policy.name}
                    </h3>
                    <span className="text-sm text-neutral-500 dark:text-neutral-400 truncate">
                      {policy.site.name || new URL(policy.site.url).hostname}
                    </span>
                  </div>

                  {/* Thresholds */}
                  <div className="mt-3 flex flex-wrap gap-3">
                    <div className="flex items-center gap-1.5 rounded-md bg-neutral-100 px-2.5 py-1 text-xs dark:bg-neutral-700">
                      <Target className="h-3 w-3 text-blue-600" />
                      <span className="text-neutral-700 dark:text-neutral-300">
                        Min Score: {policy.minScore}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-md bg-neutral-100 px-2.5 py-1 text-xs dark:bg-neutral-700">
                      <AlertTriangle className="h-3 w-3 text-red-600" />
                      <span className="text-neutral-700 dark:text-neutral-300">
                        Max Critical: {policy.maxCritical}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-md bg-neutral-100 px-2.5 py-1 text-xs dark:bg-neutral-700">
                      <TrendingDown className="h-3 w-3 text-amber-600" />
                      <span className="text-neutral-700 dark:text-neutral-300">
                        Max Drop: {policy.maxScoreDrop}pts
                      </span>
                    </div>
                    {policy.baselineScore !== null && (
                      <div className="flex items-center gap-1.5 rounded-md bg-green-100 px-2.5 py-1 text-xs dark:bg-green-900/30">
                        <RefreshCw className="h-3 w-3 text-green-600" />
                        <span className="text-green-700 dark:text-green-300">
                          Baseline: {policy.baselineScore.toFixed(0)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => togglePolicy(policy.id, !policy.enabled)}
                    className="rounded-md border border-neutral-200 p-1.5 text-neutral-500 hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-700"
                    title={policy.enabled ? "Disable" : "Enable"}
                  >
                    <Settings2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(policy.id)}
                    className="rounded-md border border-neutral-200 p-1.5 text-red-500 hover:bg-red-50 dark:border-neutral-600 dark:hover:bg-red-900/20"
                    title="Delete"
                    aria-label={`Delete policy ${policy.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CI Integration Code Block */}
      <div className="mt-8 rounded-lg border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-700 dark:bg-neutral-800">
        <h3 className="text-sm font-medium text-neutral-900 dark:text-white">
          CI/CD Integration
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Add this to your GitHub Actions workflow to gate deployments:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-neutral-900 p-4 text-xs text-neutral-100">
          {`- name: Accessibility Guard
  run: |
    RESULT=$(curl -s -X POST \\
      -H "Authorization: Bearer \${{ secrets.REGLAYER_API_KEY }}" \\
      -H "Content-Type: application/json" \\
      -d '{"scanId": "\$SCAN_ID", "siteId": "\$SITE_ID", "workspaceId": "\$WS_ID"}' \\
      https://reglayer.vercel.app/api/guard/evaluate)
    
    PASSED=$(echo $RESULT | jq -r '.passed')
    if [ "$PASSED" != "true" ]; then
      echo "❌ Regression Guard FAILED"
      echo $RESULT | jq '.verdicts[].summary'
      exit 1
    fi
    echo "✅ Regression Guard passed"`}
        </pre>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete guard policy"
        description="Are you sure you want to delete this guard policy? CI gates relying on it will stop blocking deployments. This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => deleteTarget && deletePolicy(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
    </AppShell>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-white"
      />
    </label>
  );
}
