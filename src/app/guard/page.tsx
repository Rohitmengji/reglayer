/**
 * RegLayer — CI/CD Regression Guard Page
 *
 * WHY: Teams need visibility into guard policies and their pass/fail history.
 * WHAT: Lists guard policies, shows baseline info, and allows policy management.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
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
  const [policies, setPolicies] = useState<GuardPolicyView[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

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

  useEffect(() => {
    loadPolicies();
  }, [loadPolicies]);

  const togglePolicy = async (policyId: string, enabled: boolean) => {
    await fetch(`/api/guard/${policyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    setPolicies((prev) =>
      prev.map((p) => (p.id === policyId ? { ...p, enabled } : p))
    );
  };

  const deletePolicy = async (policyId: string) => {
    await fetch(`/api/guard/${policyId}`, { method: "DELETE" });
    setPolicies((prev) => prev.filter((p) => p.id !== policyId));
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
            <ShieldAlert className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Regression Guard
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Block deployments when accessibility quality drops
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          New Policy
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

      {/* Policy List */}
      {policies.length === 0 && !showCreate ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center dark:border-gray-600 dark:bg-gray-800/50">
          <ShieldAlert className="mx-auto mb-3 h-12 w-12 text-gray-500 dark:text-gray-400" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            No guard policies yet
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
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
                  ? "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
                  : "border-gray-100 bg-gray-50 opacity-60 dark:border-gray-800 dark:bg-gray-900"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    {policy.enabled ? (
                      <ShieldCheck className="h-4 w-4 text-green-600" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    )}
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {policy.name}
                    </h3>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {policy.site.name || new URL(policy.site.url).hostname}
                    </span>
                  </div>

                  {/* Thresholds */}
                  <div className="mt-3 flex flex-wrap gap-3">
                    <div className="flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1 text-xs dark:bg-gray-700">
                      <Target className="h-3 w-3 text-blue-600" />
                      <span className="text-gray-700 dark:text-gray-300">
                        Min Score: {policy.minScore}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1 text-xs dark:bg-gray-700">
                      <AlertTriangle className="h-3 w-3 text-red-600" />
                      <span className="text-gray-700 dark:text-gray-300">
                        Max Critical: {policy.maxCritical}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1 text-xs dark:bg-gray-700">
                      <TrendingDown className="h-3 w-3 text-amber-600" />
                      <span className="text-gray-700 dark:text-gray-300">
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

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => togglePolicy(policy.id, !policy.enabled)}
                    className="rounded-md border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                    title={policy.enabled ? "Disable" : "Enable"}
                  >
                    <Settings2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deletePolicy(policy.id)}
                    className="rounded-md border border-gray-200 p-1.5 text-red-500 hover:bg-red-50 dark:border-gray-600 dark:hover:bg-red-900/20"
                    title="Delete"
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
      <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-5 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
          CI/CD Integration
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Add this to your GitHub Actions workflow to gate deployments:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-gray-900 p-4 text-xs text-gray-100">
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
    </div>
  );
}
