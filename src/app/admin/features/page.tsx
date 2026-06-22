"use client";

/**
 * RegLayer — Feature Management (Master Admin)
 *
 * WHY: Master admins control which product modules each workspace can access,
 *      and can grant time-boxed trials.
 * WHAT: A master/detail view — pick a workspace, then toggle features, grant a
 *       trial, or revert a manual override back to the plan default.
 * HOW: Follows the house style (header + Card + Button/Input/Badge/ModernSelect),
 *      gates loading/empty/error with the shared primitives, confirms every
 *      entitlement-changing action, and updates optimistically with a pending
 *      state. All copy flows through i18n.
 */

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ModernSelect } from "@/components/ui/modern-select";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageLoading } from "@/components/ui/page-loading";
import { PageError } from "@/components/ui/page-error";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Crown, Building2, ToggleLeft, ToggleRight, Clock, ArrowLeft, Search, Undo2, X, Loader2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

interface FeatureDetail {
  id: string;
  name: string;
  description: string;
  category: string;
  plans: string[];
  enabled: boolean;
  source: "plan" | "granted" | "revoked" | "expired";
  override: {
    grantedBy: string;
    grantedAt: string;
    expiresAt: string | null;
    note: string | null;
  } | null;
}

interface WorkspaceInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
  memberCount: number;
}

const CATEGORY_LABEL_KEYS: Record<string, TranslationKey> = {
  core: "admin.features.core",
  analytics: "admin.features.analyticsInsights",
  compliance: "admin.features.complianceAuditing",
  automation: "admin.features.automationIntegrations",
  enterprise: "admin.features.enterprise",
};

const TRIAL_DAY_OPTIONS = [7, 14, 30, 60, 90];

export default function AdminFeaturesPage() {
  const { t } = useI18n();
  const { data: session, status } = useSession();
  const router = useRouter();
  const isMaster = !!session?.user?.isMasterAdmin;

  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceInfo | null>(null);
  const [features, setFeatures] = useState<FeatureDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [wsError, setWsError] = useState(false);
  const [featuresLoading, setFeaturesLoading] = useState(false);
  const [featuresError, setFeaturesError] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ type: "disable" | "revert"; feature: FeatureDetail } | null>(null);

  // Trial modal
  const [trialFeature, setTrialFeature] = useState<FeatureDetail | null>(null);
  const [trialDays, setTrialDays] = useState(14);
  const [trialNote, setTrialNote] = useState("");
  const [trialSubmitting, setTrialSubmitting] = useState(false);

  // Non–master-admins never see this page.
  useEffect(() => {
    if (status !== "loading" && !isMaster) router.replace("/dashboard");
  }, [status, isMaster, router]);

  const loadWorkspaces = useCallback(() => {
    setWsError(false);
    fetch("/api/admin")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        const ws: WorkspaceInfo[] = data.workspaces.map((w: { id: string; name: string; slug: string; plan: string; members: unknown[] }) => ({
          id: w.id,
          name: w.name,
          slug: w.slug,
          plan: w.plan,
          memberCount: w.members?.length || 0,
        }));
        setWorkspaces(ws);
        setLoading(false);
      })
      .catch(() => {
        setWsError(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off the workspace fetch on mount; the synchronous set is the loading/error flag
    if (isMaster) loadWorkspaces();
  }, [isMaster, loadWorkspaces]);

  const loadFeatures = useCallback((wsId: string) => {
    setFeaturesLoading(true);
    setFeaturesError(false);
    fetch(`/api/workspace/features?workspaceId=${wsId}&detailed=true`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setFeatures(data.features))
      .catch(() => {
        setFeaturesError(true);
        toast.error(t("admin.features.loadFailed"));
      })
      .finally(() => setFeaturesLoading(false));
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches features when the selected workspace changes; the synchronous set is the loading flag
    if (selectedWorkspace) loadFeatures(selectedWorkspace.id);
  }, [selectedWorkspace, loadFeatures]);

  const withPending = (id: string, on: boolean) =>
    setPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  // Enable directly; disabling is confirmed first (it revokes a paying entitlement).
  const onToggle = (feature: FeatureDetail) => {
    if (feature.enabled) setConfirm({ type: "disable", feature });
    else applyToggle(feature, true);
  };

  const applyToggle = async (feature: FeatureDetail, enable: boolean) => {
    if (!selectedWorkspace) return;
    withPending(feature.id, true);
    // Optimistic: reflect the new state immediately, reconcile from the server after.
    setFeatures((fs) => fs.map((f) => (f.id === feature.id ? { ...f, enabled: enable } : f)));
    try {
      const res = await fetch("/api/workspace/features", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: selectedWorkspace.id, feature: feature.id, enabled: enable }),
      });
      if (!res.ok) throw new Error();
      toast.success(t(enable ? "admin.features.enabledToast" : "admin.features.disabledToast", { feature: feature.name }));
    } catch {
      toast.error(t("admin.features.updateFailed"));
    } finally {
      loadFeatures(selectedWorkspace.id);
      withPending(feature.id, false);
    }
  };

  const applyRevert = async (feature: FeatureDetail) => {
    if (!selectedWorkspace) return;
    withPending(feature.id, true);
    try {
      const res = await fetch("/api/workspace/features", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: selectedWorkspace.id, feature: feature.id }),
      });
      if (!res.ok) throw new Error();
      toast.success(t("admin.features.revertedToast", { feature: feature.name }));
    } catch {
      toast.error(t("admin.features.updateFailed"));
    } finally {
      loadFeatures(selectedWorkspace.id);
      withPending(feature.id, false);
    }
  };

  const grantTrial = async () => {
    if (!selectedWorkspace || !trialFeature) return;
    setTrialSubmitting(true);
    const expiresAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();
    try {
      const res = await fetch("/api/workspace/features", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspace.id,
          feature: trialFeature.id,
          enabled: true,
          expiresAt,
          note: trialNote || `${trialDays}-day trial`,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(t("admin.features.trialGrantedToast", { days: trialDays, feature: trialFeature.name }));
      setTrialFeature(null);
      setTrialNote("");
      loadFeatures(selectedWorkspace.id);
    } catch {
      toast.error(t("admin.features.trialFailed"));
    } finally {
      setTrialSubmitting(false);
    }
  };

  if (!isMaster) return null;

  const filteredWorkspaces = workspaces.filter(
    (w) =>
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.slug.toLowerCase().includes(search.toLowerCase())
  );

  const groupedFeatures = features.reduce<Record<string, FeatureDetail[]>>((acc, f) => {
    (acc[f.category] ||= []).push(f);
    return acc;
  }, {});

  const statusBadge = (source: FeatureDetail["source"]) => {
    if (source === "granted") return <Badge variant="success">{t("admin.features.badgeGranted")}</Badge>;
    if (source === "revoked") return <Badge variant="destructive">{t("admin.features.badgeRevoked")}</Badge>;
    if (source === "expired") return <Badge variant="moderate">{t("admin.features.badgeExpired")}</Badge>;
    return null;
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header — house pattern */}
        <div>
          <Button variant="ghost" size="sm" onClick={() => router.push("/admin")} className="mb-2 -ml-2 text-neutral-500 dark:text-neutral-400">
            <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" /> Admin
          </Button>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t("admin.features.title")}</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t("admin.features.subtitle")}</p>
        </div>

        {loading ? (
          <PageLoading />
        ) : wsError ? (
          <PageError onRetry={loadWorkspaces} />
        ) : workspaces.length === 0 ? (
          <EmptyState icon={Building2} title={t("admin.features.noWorkspaces")} description={t("admin.features.noWorkspacesDesc")} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Workspace list */}
            <Card className="lg:col-span-1">
              <CardContent className="p-4 space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 dark:text-neutral-500" />
                  <Input
                    type="search"
                    placeholder={t("admin.features.searchPlaceholder")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                    aria-label={t("admin.features.searchPlaceholder")}
                  />
                </div>

                <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                  {filteredWorkspaces.map((ws) => {
                    const active = selectedWorkspace?.id === ws.id;
                    return (
                      <button
                        key={ws.id}
                        onClick={() => setSelectedWorkspace(ws)}
                        aria-current={active ? "true" : undefined}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                          active
                            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                            : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span className="font-medium truncate">{ws.name}</span>
                          </div>
                          <Badge
                            variant={ws.plan === "ENTERPRISE" ? "default" : ws.plan === "PRO" ? "secondary" : "outline"}
                            className="shrink-0"
                          >
                            {ws.plan}
                          </Badge>
                        </div>
                        <p className="text-[11px] mt-0.5 opacity-60 pl-5">
                          {t("admin.features.membersCount", { count: ws.memberCount })}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Feature detail */}
            <Card className="lg:col-span-2">
              <CardContent className="p-4">
                {!selectedWorkspace ? (
                  <EmptyState
                    icon={Crown}
                    title={t("admin.features.selectWorkspaceTitle")}
                    description={t("admin.features.selectWorkspaceDesc")}
                  />
                ) : featuresLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-neutral-400 dark:text-neutral-500" aria-hidden="true" />
                  </div>
                ) : featuresError ? (
                  <PageError title={t("common.loadErrorTitle")} onRetry={() => loadFeatures(selectedWorkspace.id)} />
                ) : (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-700 pb-3">
                      <div className="min-w-0">
                        <h2 className="font-semibold text-neutral-900 dark:text-white truncate">{selectedWorkspace.name}</h2>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 flex items-center gap-1.5">
                          {t("admin.features.planLabel")}
                          <Badge variant="outline">{selectedWorkspace.plan}</Badge>
                        </p>
                      </div>
                    </div>

                    {Object.entries(groupedFeatures).map(([category, items]) => (
                      <div key={category}>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400 mb-2">
                          {CATEGORY_LABEL_KEYS[category] ? t(CATEGORY_LABEL_KEYS[category]) : category}
                        </h3>
                        <div className="space-y-1">
                          {items.map((feature) => {
                            const isPending = pending.has(feature.id);
                            return (
                              <div
                                key={feature.id}
                                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-medium text-neutral-900 dark:text-white">{feature.name}</span>
                                    {statusBadge(feature.source)}
                                    {feature.override?.expiresAt && feature.source === "granted" && (
                                      <span className="text-[10px] text-neutral-500 dark:text-neutral-400 flex items-center gap-0.5">
                                        <Clock className="h-3 w-3" aria-hidden="true" />
                                        {new Date(feature.override.expiresAt).toLocaleDateString()}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">{feature.description}</p>
                                  {feature.override?.note && (
                                    <p className="text-[10px] text-neutral-500 dark:text-neutral-400 italic mt-0.5">{feature.override.note}</p>
                                  )}
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  {feature.override && (
                                    <button
                                      onClick={() => setConfirm({ type: "revert", feature })}
                                      disabled={isPending}
                                      aria-label={t("admin.features.revertAction")}
                                      title={t("admin.features.revertAction")}
                                      className="p-1.5 rounded-md text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                      <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                                    </button>
                                  )}

                                  {!feature.enabled && (
                                    <button
                                      onClick={() => { setTrialFeature(feature); setTrialDays(14); setTrialNote(""); }}
                                      disabled={isPending}
                                      aria-label={t("admin.features.trialAction")}
                                      title={t("admin.features.trialAction")}
                                      className="p-1.5 rounded-md text-neutral-500 dark:text-neutral-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                                    </button>
                                  )}

                                  <button
                                    role="switch"
                                    aria-checked={feature.enabled}
                                    aria-label={t(feature.enabled ? "admin.features.disableAction" : "admin.features.enableAction", { feature: feature.name })}
                                    disabled={isPending}
                                    onClick={() => onToggle(feature)}
                                    className="p-1 rounded-md disabled:cursor-not-allowed transition-colors"
                                  >
                                    {isPending ? (
                                      <Loader2 className="h-6 w-6 animate-spin text-neutral-400" aria-hidden="true" />
                                    ) : feature.enabled ? (
                                      <ToggleRight className="h-6 w-6 text-accent" aria-hidden="true" />
                                    ) : (
                                      <ToggleLeft className="h-6 w-6 text-neutral-300 dark:text-neutral-600" aria-hidden="true" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Confirm: disable / revert */}
      <ConfirmDialog
        open={!!confirm}
        variant="danger"
        title={confirm?.type === "disable" ? t("admin.features.disableConfirmTitle") : t("admin.features.revertConfirmTitle")}
        description={
          confirm
            ? confirm.type === "disable"
              ? t("admin.features.disableConfirmDesc", { workspace: selectedWorkspace?.name ?? "", feature: confirm.feature.name })
              : t("admin.features.revertConfirmDesc", { feature: confirm.feature.name })
            : ""
        }
        confirmLabel={confirm?.type === "disable" ? t("admin.features.disableConfirmCta") : t("admin.features.revertConfirmCta")}
        cancelLabel={t("common.cancel")}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          const { type, feature } = confirm;
          setConfirm(null);
          if (type === "disable") applyToggle(feature, false);
          else applyRevert(feature);
        }}
      />

      {/* Grant-trial modal */}
      {trialFeature && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t("admin.features.grantTrialTitle")}
          onClick={() => !trialSubmitting && setTrialFeature(null)}
        >
          <div className="w-full max-w-sm bg-white dark:bg-neutral-900 rounded-xl shadow-xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" aria-hidden="true" /> {t("admin.features.grantTrialTitle")}
                </h3>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {t("admin.features.grantTrialDesc", { workspace: selectedWorkspace?.name ?? "", feature: trialFeature.name })}
                </p>
              </div>
              <button
                aria-label={t("a11y.close")}
                onClick={() => setTrialFeature(null)}
                className="shrink-0 text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">{t("admin.features.trialDuration")}</label>
                <ModernSelect
                  options={TRIAL_DAY_OPTIONS.map((d) => ({ value: String(d), label: t("admin.features.daysOption", { days: d }) }))}
                  value={String(trialDays)}
                  onChange={(v) => setTrialDays(Number(v))}
                />
              </div>
              <Input
                type="text"
                placeholder={t("admin.features.noteOptional")}
                value={trialNote}
                onChange={(e) => setTrialNote(e.target.value)}
              />
              <Button className="w-full" onClick={grantTrial} disabled={trialSubmitting}>
                {trialSubmitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" />}
                {t("admin.features.grantTrialCta")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
