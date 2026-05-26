"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, ChevronLeft, ChevronRight, Scan, Users, Settings, Webhook, Key, Globe } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

interface AuditEntry {
  id: string;
  action: string;
  actor: string | null;
  target: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const actionIcons: Record<string, typeof Scan> = {
  "scan.created": Scan,
  "scan.completed": Scan,
  "scan.deleted": Scan,
  "member.invited": Users,
  "member.removed": Users,
  "member.role_changed": Users,
  "settings.updated": Settings,
  "webhook.created": Webhook,
  "webhook.deleted": Webhook,
  "apikey.created": Key,
  "apikey.revoked": Key,
  "crawl.started": Globe,
};

const actionLabels: Record<string, string> = {
  "scan.created": "Scan started",
  "scan.completed": "Scan completed",
  "scan.deleted": "Scan deleted",
  "member.invited": "Member invited",
  "member.removed": "Member removed",
  "member.role_changed": "Role changed",
  "settings.updated": "Settings updated",
  "webhook.created": "Webhook created",
  "webhook.deleted": "Webhook deleted",
  "apikey.created": "API key created",
  "apikey.revoked": "API key revoked",
  "crawl.started": "Site crawl started",
};

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  useEffect(() => {
    fetchLogs(1);
  }, []);

  async function fetchLogs(page: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/audit-log?page=${page}&limit=50`);
      if (!res.ok) return;
      const data = await res.json();
      setLogs(data.logs || []);
      setPagination(data.pagination || { page: 1, limit: 50, total: 0, pages: 0 });
    } catch {
      // Network error
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t("auditLog.title")}</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {t("auditLog.subtitle")}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Activity ({pagination.total} events)
              </span>
              {pagination.pages > 1 && (
                <div className="flex items-center gap-2 text-sm font-normal">
                  <button
                    onClick={() => fetchLogs(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="rounded p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-neutral-500">
                    {pagination.page} / {pagination.pages}
                  </span>
                  <button
                    onClick={() => fetchLogs(pagination.page + 1)}
                    disabled={pagination.page >= pagination.pages}
                    className="rounded p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-neutral-500 py-8 text-center">Loading audit log...</p>
            ) : logs.length === 0 ? (
              <div className="text-center py-12">
                <ClipboardList className="h-10 w-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
                <p className="text-sm text-neutral-500 dark:text-neutral-400">No activity recorded yet.</p>
                <p className="text-xs text-neutral-400 mt-1">Actions like scans, team changes, and settings updates will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {logs.map((log) => {
                  const Icon = actionIcons[log.action] || ClipboardList;
                  const label = actionLabels[log.action] || log.action;
                  return (
                    <div key={log.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="mt-0.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 p-2 shrink-0">
                        <Icon className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-900 dark:text-white">{label}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                          {log.actor && <span>{log.actor}</span>}
                          {log.target && (
                            <>
                              <span>→</span>
                              <code className="rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[10px] font-mono truncate max-w-48">
                                {log.target}
                              </code>
                            </>
                          )}
                        </div>
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <p className="text-[10px] text-neutral-400 mt-1 truncate">
                            {JSON.stringify(log.metadata)}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] text-neutral-400 shrink-0 mt-1">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
