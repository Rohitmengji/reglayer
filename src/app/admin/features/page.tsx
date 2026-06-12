"use client";

/**
 * RegLayer — Feature Management (Master Admin)
 *
 * WHY: Master admin needs to control which product modules each workspace can access.
 * WHAT: Grid showing all workspaces × features, toggle switches, trial grants with expiry.
 * HOW: Fetches workspace list + feature matrix, allows toggling per workspace.
 */

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Crown,
  Building2,
  ToggleLeft,
  ToggleRight,
  Clock,
  ArrowLeft,
  Search,
  Undo2,
} from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

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

export default function AdminFeaturesPage() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceInfo | null>(null);
  const [features, setFeatures] = useState<FeatureDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [trialFeature, setTrialFeature] = useState<string | null>(null);
  const [trialDays, setTrialDays] = useState(14);
  const [trialNote, setTrialNote] = useState("");

  // Load workspaces
  useEffect(() => {
    if (!session?.user?.isMasterAdmin) return;
    fetch("/api/admin")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        const ws = data.workspaces.map((w: { id: string; name: string; slug: string; plan: string; members: unknown[] }) => ({
          id: w.id,
          name: w.name,
          slug: w.slug,
          plan: w.plan,
          memberCount: w.members?.length || 0,
        }));
        setWorkspaces(ws);
        setLoading(false);
      })
      .catch(() => { setLoading(false); });
  }, [session]);

  // Load features for selected workspace
  const loadFeatures = useCallback((wsId: string) => {
    fetch(`/api/workspace/features?workspaceId=${wsId}&detailed=true`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => setFeatures(data.features))
      .catch(() => toast.error("Failed to load features"));
  }, []);

  useEffect(() => {
    if (selectedWorkspace) loadFeatures(selectedWorkspace.id);
  }, [selectedWorkspace, loadFeatures]);

  // Toggle feature
  const toggleFeature = async (featureId: string, enable: boolean) => {
    if (!selectedWorkspace) return;
    const res = await fetch("/api/workspace/features", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: selectedWorkspace.id,
        feature: featureId,
        enabled: enable,
      }),
    });
    if (res.ok) {
      toast.success(`${featureId} ${enable ? "enabled" : "disabled"}`);
      loadFeatures(selectedWorkspace.id);
    } else {
      toast.error("Failed to update feature");
    }
  };

  // Grant trial
  const grantTrial = async (featureId: string) => {
    if (!selectedWorkspace) return;
    const expiresAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch("/api/workspace/features", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: selectedWorkspace.id,
        feature: featureId,
        enabled: true,
        expiresAt,
        note: trialNote || `${trialDays}-day trial`,
      }),
    });
    if (res.ok) {
      toast.success(`${trialDays}-day trial granted for ${featureId}`);
      setTrialFeature(null);
      setTrialNote("");
      loadFeatures(selectedWorkspace.id);
    } else {
      toast.error("Failed to grant trial");
    }
  };

  // Revert override
  const revertOverride = async (featureId: string) => {
    if (!selectedWorkspace) return;
    const res = await fetch("/api/workspace/features", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: selectedWorkspace.id,
        feature: featureId,
      }),
    });
    if (res.ok) {
      toast.success(`Reverted ${featureId} to plan default`);
      loadFeatures(selectedWorkspace.id);
    }
  };

  if (!session?.user?.isMasterAdmin) {
    router.push("/dashboard");
    return null;
  }

  const filteredWorkspaces = workspaces.filter(
    (w) => w.name.toLowerCase().includes(search.toLowerCase()) || w.slug.toLowerCase().includes(search.toLowerCase())
  );

  const groupedFeatures = features.reduce<Record<string, FeatureDetail[]>>((acc, f) => {
    (acc[f.category] ||= []).push(f);
    return acc;
  }, {});

  const categoryLabels: Record<string, string> = {
    core: "Core",
    analytics: "Analytics & Insights",
    compliance: "Compliance & Auditing",
    automation: "Automation & Integrations",
    enterprise: "Enterprise",
  };

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push("/admin")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Admin
            </Button>
            <div>
              <h1 className="text-xl font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                <Shield className="h-5 w-5 text-red-500" />
                Feature Management
              </h1>
              <p className="text-sm text-neutral-500">{t("admin.features.subtitle")}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Workspace List */}
          <Card className="lg:col-span-1">
            <CardContent className="p-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-500 dark:text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search workspaces..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                />
              </div>

              {loading ? (
                <div className="text-center py-8 text-neutral-500 dark:text-neutral-400 text-sm">Loading...</div>
              ) : (
                <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                  {filteredWorkspaces.map((ws) => (
                    <button
                      key={ws.id}
                      onClick={() => setSelectedWorkspace(ws)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        selectedWorkspace?.id === ws.id
                          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                          : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 shrink-0" />
                          <span className="font-medium truncate">{ws.name}</span>
                        </div>
                        <Badge variant={ws.plan === "ENTERPRISE" ? "default" : ws.plan === "PRO" ? "secondary" : "outline"} className="text-[10px] shrink-0">
                          {ws.plan}
                        </Badge>
                      </div>
                      <p className="text-[11px] mt-0.5 opacity-60 pl-5">{ws.memberCount} members</p>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Feature Matrix */}
          <Card className="lg:col-span-2">
            <CardContent className="p-4">
              {!selectedWorkspace ? (
                <div className="flex flex-col items-center justify-center h-64 text-neutral-500 dark:text-neutral-400">
                  <Crown className="h-8 w-8 mb-2" />
                  <p className="text-sm">Select a workspace to manage features</p>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-700 pb-3">
                    <div>
                      <h2 className="font-semibold text-neutral-900 dark:text-white">{selectedWorkspace.name}</h2>
                      <p className="text-xs text-neutral-500">
                        Plan: <Badge variant="outline" className="text-[10px] ml-1">{selectedWorkspace.plan}</Badge>
                      </p>
                    </div>
                  </div>

                  {Object.entries(groupedFeatures).map(([category, items]) => (
                    <div key={category}>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
                        {categoryLabels[category] || category}
                      </h3>
                      <div className="space-y-1">
                        {items.map((feature) => (
                          <div
                            key={feature.id}
                            className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-neutral-900 dark:text-white">{feature.name}</span>
                                {feature.source === "granted" && (
                                  <Badge className="text-[9px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">GRANTED</Badge>
                                )}
                                {feature.source === "revoked" && (
                                  <Badge className="text-[9px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">REVOKED</Badge>
                                )}
                                {feature.source === "expired" && (
                                  <Badge className="text-[9px] bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">EXPIRED</Badge>
                                )}
                                {feature.override?.expiresAt && feature.source === "granted" && (
                                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400 flex items-center gap-0.5">
                                    <Clock className="h-3 w-3" />
                                    {new Date(feature.override.expiresAt).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-neutral-500 truncate">{feature.description}</p>
                              {feature.override?.note && (
                                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 italic mt-0.5">{feature.override.note}</p>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 ml-3">
                              {/* Revert button (only if overridden) */}
                              {feature.override && (
                                <button
                                  onClick={() => revertOverride(feature.id)}
                                  className="p-1.5 rounded text-neutral-500 dark:text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                                  title="Revert to plan default"
                                >
                                  <Undo2 className="h-3.5 w-3.5" />
                                </button>
                              )}

                              {/* Trial button (only if not currently enabled) */}
                              {!feature.enabled && (
                                <button
                                  onClick={() => setTrialFeature(trialFeature === feature.id ? null : feature.id)}
                                  className="p-1.5 rounded text-neutral-500 dark:text-neutral-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                                  title="Grant trial access"
                                >
                                  <Clock className="h-3.5 w-3.5" />
                                </button>
                              )}

                              {/* Toggle */}
                              <button
                                onClick={() => toggleFeature(feature.id, !feature.enabled)}
                                className="p-1"
                              >
                                {feature.enabled ? (
                                  <ToggleRight className="h-6 w-6 text-green-500" />
                                ) : (
                                  <ToggleLeft className="h-6 w-6 text-neutral-300 dark:text-neutral-600" />
                                )}
                              </button>
                            </div>

                            {/* Trial form (inline) */}
                            {trialFeature === feature.id && (
                              <div className="absolute right-4 mt-16 p-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg z-10 w-60">
                                <p className="text-xs font-medium mb-2">Grant Trial Access</p>
                                <div className="space-y-2">
                                  <select
                                    value={trialDays}
                                    onChange={(e) => setTrialDays(Number(e.target.value))}
                                    className="w-full text-xs px-2 py-1.5 border rounded dark:bg-neutral-700 dark:border-neutral-600"
                                  >
                                    <option value={7}>7 days</option>
                                    <option value={14}>14 days</option>
                                    <option value={30}>30 days</option>
                                    <option value={60}>60 days</option>
                                    <option value={90}>90 days</option>
                                  </select>
                                  <input
                                    type="text"
                                    placeholder="Note (optional)"
                                    value={trialNote}
                                    onChange={(e) => setTrialNote(e.target.value)}
                                    className="w-full text-xs px-2 py-1.5 border rounded dark:bg-neutral-700 dark:border-neutral-600"
                                  />
                                  <Button size="sm" className="w-full text-xs" onClick={() => grantTrial(feature.id)}>
                                    Grant Trial
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
