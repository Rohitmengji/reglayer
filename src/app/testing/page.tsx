/**
 * RegLayer — Human Testing Network Page
 *
 * WHY: Automated tools miss 60%+ of real accessibility barriers.
 * WHAT: Marketplace for booking manual audits with certified testers and people with disabilities.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  UserCheck,
  ClipboardCheck,
  Clock,
  DollarSign,
  Plus,
  Eye,
  Keyboard,
  Brain,
  Accessibility,
  FileSearch,
} from "lucide-react";

interface AuditRequestView {
  id: string;
  type: string;
  status: string;
  scope: string;
  urgency: string;
  budget: number | null;
  combinedScore: number | null;
  createdAt: string;
  completedAt: string | null;
  site: { id: string; url: string; name: string | null };
  tester: { id: string; name: string } | null;
}

const TYPE_INFO: Record<string, { label: string; icon: React.ElementType; description: string }> = {
  "full-audit": { label: "Full Accessibility Audit", icon: ClipboardCheck, description: "Comprehensive WCAG 2.1 AA manual audit" },
  "screen-reader-test": { label: "Screen Reader Testing", icon: Eye, description: "Testing with NVDA, JAWS, and VoiceOver" },
  "keyboard-test": { label: "Keyboard Navigation", icon: Keyboard, description: "Full keyboard-only navigation testing" },
  "cognitive-review": { label: "Cognitive Review", icon: Brain, description: "Plain language, navigation clarity, error recovery" },
  "usability-test": { label: "Usability Testing", icon: Accessibility, description: "Testing with users with disabilities" },
  "vpat-validation": { label: "VPAT Validation", icon: FileSearch, description: "Expert validation of VPAT/ACR accuracy" },
};

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  draft: { bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-700 dark:text-gray-300" },
  submitted: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300" },
  matched: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-300" },
  "in-progress": { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300" },
  review: { bg: "bg-cyan-100 dark:bg-cyan-900/30", text: "text-cyan-700 dark:text-cyan-300" },
  completed: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300" },
  cancelled: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300" },
};

export default function TestingPage() {
  const [audits, setAudits] = useState<AuditRequestView[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAudits = useCallback(async () => {
    try {
      const wsRes = await fetch("/api/workspaces/current");
      if (!wsRes.ok) return;
      const { workspace } = await wsRes.json();

      const res = await fetch(`/api/testing?workspaceId=${workspace.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setAudits(data.audits);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAudits();
  }, [loadAudits]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
            <Users className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Human Testing Network
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Book manual accessibility audits with certified testers
            </p>
          </div>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
          <Plus className="h-4 w-4" />
          Request Audit
        </button>
      </div>

      {/* Service Types */}
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(TYPE_INFO).map(([key, info]) => {
          const Icon = info.icon;
          return (
            <div
              key={key}
              className="rounded-lg border border-gray-200 bg-white p-4 hover:border-green-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:hover:border-green-700"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-green-600 dark:text-green-400" />
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                  {info.label}
                </h3>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {info.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* Why Human Testing */}
      <div className="mb-8 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
        <h3 className="text-sm font-medium text-green-900 dark:text-green-200">
          Why combine automated + human testing?
        </h3>
        <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-green-800 dark:text-green-300 sm:grid-cols-3">
          <div className="flex items-center gap-2">
            <span className="font-bold">30-40%</span> — automated detection rate
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold">85-95%</span> — combined detection rate
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold">2.5x</span> — more issues found with human testing
          </div>
        </div>
      </div>

      {/* Audit Requests */}
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
        Your Audit Requests
      </h2>

      {audits.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center dark:border-gray-600 dark:bg-gray-800/50">
          <UserCheck className="mx-auto mb-3 h-12 w-12 text-gray-400" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            No audit requests yet
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Request your first human accessibility audit to get expert findings.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {audits.map((audit) => {
            const typeInfo = TYPE_INFO[audit.type];
            const statusStyle = STATUS_STYLES[audit.status] ?? STATUS_STYLES.draft;
            return (
              <div
                key={audit.id}
                className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {typeInfo?.label ?? audit.type}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                        {audit.status}
                      </span>
                      {audit.urgency !== "standard" && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
                          {audit.urgency}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {audit.site.name || new URL(audit.site.url).hostname} — {audit.scope}
                    </p>
                    <div className="mt-2 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(audit.createdAt).toLocaleDateString()}
                      </span>
                      {audit.budget && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          ${audit.budget.toLocaleString()}
                        </span>
                      )}
                      {audit.tester && (
                        <span className="flex items-center gap-1">
                          <UserCheck className="h-3 w-3" />
                          {audit.tester.name}
                        </span>
                      )}
                    </div>
                  </div>
                  {audit.combinedScore !== null && (
                    <div className="text-right">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Combined Score</div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">
                        {audit.combinedScore.toFixed(0)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
