/**
 * RegLayer — Agency Admin Dashboard
 *
 * WHY: Agency owners manage their brand, clients, and API keys.
 * WHAT: Full admin page for white-label agency management.
 * ACCESS: Master admin can create agencies; agency owners manage theirs.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/components/i18n-provider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSession } from "next-auth/react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageLoading } from "@/components/ui/page-loading";
import { PageError } from "@/components/ui/page-error";
import { FeatureGate } from "@/components/ui/feature-gate";
import { Building2, Palette, Users, Key, Plus, Trash2, Copy } from "lucide-react";

interface Agency {
  id: string;
  name: string;
  slug: string;
  brandName: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  supportEmail: string | null;
  plan: string;
  maxClients: number;
  isActive: boolean;
  clients: AgencyClient[];
  apiKeys: AgencyApiKeyDisplay[];
  _count: { clients: number };
}

interface AgencyClient {
  id: string;
  clientName: string;
  contactEmail: string;
  isActive: boolean;
  addedAt: string;
  workspace: { id: string; name: string; slug: string };
}

interface AgencyApiKeyDisplay {
  id: string;
  keyPrefix: string;
  label: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

function AgencyDashboardInner() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const [agency, setAgency] = useState<Agency | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [canCreate, setCanCreate] = useState(false);

  // Create agency form
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [creatingAgency, setCreatingAgency] = useState(false);

  // Branding form
  const [brandName, setBrandName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#6366f1");
  const [accentColor, setAccentColor] = useState("#4f46e5");
  const [supportEmail, setSupportEmail] = useState("");
  const [savingBrand, setSavingBrand] = useState(false);

  // Add client form
  const [showAddClient, setShowAddClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [addingClient, setAddingClient] = useState(false);

  // API Key generation
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);

  const loadAgency = useCallback(async () => {
    try {
      const res = await fetch("/api/agency");
      if (!res.ok) throw new Error(t("agency.errLoad"));
      const data = await res.json();
      if (data.canCreate) setCanCreate(true);
      if (data.agencies?.length > 0) {
        const agencyId = data.agencies[0].id;
        const detailRes = await fetch(`/api/agency/${agencyId}`);
        if (!detailRes.ok) throw new Error(t("agency.errLoadDetails"));
        const detail = await detailRes.json();
        setAgency(detail.agency);
        setBrandName(detail.agency.brandName);
        setPrimaryColor(detail.agency.primaryColor);
        setAccentColor(detail.agency.accentColor);
        setSupportEmail(detail.agency.supportEmail || "");
      } else {
        setShowCreateForm(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("agency.errLoadGeneric"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!session) return;
    fetch("/api/agency")
      .then((res) => {
        if (!res.ok) throw new Error(t("agency.errLoad"));
        return res.json();
      })
      .then(async (data) => {
        if (data.canCreate) setCanCreate(true);
        if (data.agencies?.length > 0) {
          const agencyId = data.agencies[0].id;
          const detailRes = await fetch(`/api/agency/${agencyId}`);
          if (!detailRes.ok) throw new Error(t("agency.errLoadDetails"));
          const detail = await detailRes.json();
          setAgency(detail.agency);
          setBrandName(detail.agency.brandName);
          setPrimaryColor(detail.agency.primaryColor);
          setAccentColor(detail.agency.accentColor);
          setSupportEmail(detail.agency.supportEmail || "");
        } else {
          setShowCreateForm(true);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : t("agency.errLoadGeneric")))
      .finally(() => setLoading(false));
  }, [session, t]);

  const createAgency = async () => {
    if (!createName || !createSlug) return;
    setCreatingAgency(true);
    setError(null);
    try {
      const res = await fetch("/api/agency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName,
          slug: createSlug,
          brandName: createName,
          primaryColor: "#6366f1",
          accentColor: "#4f46e5",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t("agency.errCreate"));
      }
      setShowCreateForm(false);
      await loadAgency();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("agency.errCreateGeneric"));
    } finally {
      setCreatingAgency(false);
    }
  };

  const saveBranding = async () => {
    if (!agency) return;
    setSavingBrand(true);
    try {
      const res = await fetch(`/api/agency/${agency.id}/branding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandName, primaryColor, accentColor, supportEmail: supportEmail || null }),
      });
      if (!res.ok) throw new Error(t("agency.errSaveBranding"));
      await loadAgency();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("agency.errSaveGeneric"));
    } finally {
      setSavingBrand(false);
    }
  };

  const addClient = async () => {
    if (!agency || !newClientName || !newClientEmail) return;
    setAddingClient(true);
    try {
      const res = await fetch(`/api/agency/${agency.id}/clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName: newClientName, contactEmail: newClientEmail }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || t("agency.errAddClient"));
      }
      setNewClientName("");
      setNewClientEmail("");
      setShowAddClient(false);
      await loadAgency();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("agency.errAddGeneric"));
    } finally {
      setAddingClient(false);
    }
  };

  const [confirmAction, setConfirmAction] = useState<{ type: "removeClient" | "revokeKey"; id: string } | null>(null);

  const removeClient = async (clientId: string) => {
    if (!agency) return;
    try {
      const res = await fetch(`/api/agency/${agency.id}/clients/${clientId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(t("agency.errRemoveClient"));
      await loadAgency();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("agency.errRemoveGeneric"));
    }
    setConfirmAction(null);
  };

  const generateApiKey = async () => {
    if (!agency || !newKeyLabel) return;
    setGeneratingKey(true);
    try {
      const res = await fetch(`/api/agency/${agency.id}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newKeyLabel }),
      });
      if (!res.ok) throw new Error(t("agency.errGenerateKey"));
      const data = await res.json();
      setGeneratedKey(data.apiKey.key);
      setNewKeyLabel("");
      await loadAgency();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("agency.errGenerateGeneric"));
    } finally {
      setGeneratingKey(false);
    }
  };

  const revokeApiKey = async (keyId: string) => {
    if (!agency) return;
    try {
      const res = await fetch(`/api/agency/${agency.id}/api-keys/${keyId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(t("agency.errRevokeKey"));
      await loadAgency();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("agency.errRevokeGeneric"));
    }
    setConfirmAction(null);
  };

  if (loading) {
    return (
      <AppShell>
        <PageLoading message={t("agency.loadingSettings")} />
      </AppShell>
    );
  }

  if (showCreateForm && !agency) {
    return (
      <AppShell>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t("agency.title")}</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {t("agency.createSubtitle")}
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {canCreate ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  <CardTitle className="text-sm">{t("agency.createAgency")}</CardTitle>
                </div>
                <CardDescription>{t("agency.createAgencyDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="agencyName" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {t("agency.agencyName")}
                  </label>
                  <Input
                    id="agencyName"
                    value={createName}
                    onChange={(e) => {
                      setCreateName(e.target.value);
                      setCreateSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                    }}
                    placeholder={t("agency.agencyNamePlaceholder")}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="agencySlug" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {t("agency.urlSlug")}
                  </label>
                  <Input
                    id="agencySlug"
                    value={createSlug}
                    onChange={(e) => setCreateSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder={t("agency.slugPlaceholder")}
                    className="font-mono"
                  />
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">{createSlug || t("agency.slugPlaceholder")}.reglayer.dev</p>
                </div>
                <Button
                  onClick={createAgency}
                  disabled={creatingAgency || !createName || !createSlug}
                >
                  {creatingAgency ? t("agency.creating") : t("agency.createAgency")}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Building2 className="h-10 w-10 mx-auto text-neutral-300 dark:text-neutral-600 mb-3" />
                <p className="text-neutral-600 dark:text-neutral-400 font-medium">{t("agency.noAgency")}</p>
                <p className="text-sm text-neutral-500 dark:text-neutral-500 mt-1">
                  {t("agency.noAgencyDesc")}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </AppShell>
    );
  }

  if (error && !agency) {
    return (
      <AppShell>
        <PageError
          title={t("agency.loadErrorTitle")}
          message={t("agency.loadErrorMessage")}
          onRetry={() => window.location.reload()}
        />
      </AppShell>
    );
  }

  if (!agency) return null;

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t("agency.title")}</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {t("agency.dashboardSubtitle")}
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            <button onClick={() => setError(null)} className="text-xs text-red-500 mt-1 hover:underline">{t("agency.dismiss")}</button>
          </div>
        )}

        {/* Branding */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              <CardTitle className="text-sm">{t("agency.branding")}</CardTitle>
            </div>
            <CardDescription>{t("agency.brandingDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="brandName" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {t("agency.brandName")}
                </label>
                <Input
                  id="brandName"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="supportEmail" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {t("agency.supportEmail")}
                </label>
                <Input
                  id="supportEmail"
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  placeholder={t("agency.supportEmailPlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {t("agency.primaryColor")}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-9 w-9 rounded border border-neutral-200 dark:border-neutral-700 cursor-pointer"
                  />
                  <Input
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="font-mono text-xs"
                    aria-label={t("agency.primaryColorHex")}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {t("agency.accentColor")}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="h-9 w-9 rounded border border-neutral-200 dark:border-neutral-700 cursor-pointer"
                  />
                  <Input
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="font-mono text-xs"
                    aria-label={t("agency.accentColorHex")}
                  />
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 p-4">
              <p className="text-xs text-neutral-500 mb-2 font-medium">{t("agency.preview")}</p>
              <div className="flex items-center gap-3">
                <span className="font-bold text-lg" style={{ color: primaryColor }}>{brandName}</span>
              </div>
              <button
                type="button"
                className="mt-2 px-4 py-1.5 rounded-md text-white text-sm font-medium"
                style={{ backgroundColor: primaryColor }}
              >
                {t("agency.sampleButton")}
              </button>
            </div>

            <Button onClick={saveBranding} disabled={savingBrand} size="sm">
              {savingBrand ? t("agency.saving") : t("agency.saveBranding")}
            </Button>
          </CardContent>
        </Card>

        {/* Clients */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                <CardTitle className="text-sm">{t("agency.clientsCount", { used: String(agency._count.clients), max: String(agency.maxClients) })}</CardTitle>
              </div>
              <Button size="sm" onClick={() => setShowAddClient(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                {t("agency.addClient")}
              </Button>
            </div>
            <CardDescription>{t("agency.clientsDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {showAddClient && (
              <div className="mb-4 p-4 rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    placeholder={t("agency.clientNamePlaceholder")}
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                  />
                  <Input
                    type="email"
                    placeholder={t("agency.contactEmailPlaceholder")}
                    value={newClientEmail}
                    onChange={(e) => setNewClientEmail(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={addClient}
                    disabled={addingClient || !newClientName || !newClientEmail}
                  >
                    {addingClient ? t("agency.adding") : t("agency.add")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowAddClient(false)}>
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>
            )}

            {agency.clients.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">{t("agency.noClients")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 dark:border-neutral-700">
                      <th className="text-left py-2 px-2 font-medium text-neutral-600 dark:text-neutral-400">{t("agency.colClient")}</th>
                      <th className="text-left py-2 px-2 font-medium text-neutral-600 dark:text-neutral-400">{t("agency.colEmail")}</th>
                      <th className="text-left py-2 px-2 font-medium text-neutral-600 dark:text-neutral-400">{t("agency.colStatus")}</th>
                      <th className="text-left py-2 px-2 font-medium text-neutral-600 dark:text-neutral-400">{t("agency.colAdded")}</th>
                      <th className="text-right py-2 px-2 font-medium text-neutral-600 dark:text-neutral-400">{t("agency.colActions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agency.clients.map((client) => (
                      <tr key={client.id} className="border-b border-neutral-100 dark:border-neutral-800">
                        <td className="py-2 px-2 text-neutral-900 dark:text-neutral-100">{client.clientName}</td>
                        <td className="py-2 px-2 text-neutral-600 dark:text-neutral-400">{client.contactEmail}</td>
                        <td className="py-2 px-2">
                          <Badge variant={client.isActive ? "default" : "secondary"}>
                            {client.isActive ? t("common.active") : t("common.inactive")}
                          </Badge>
                        </td>
                        <td className="py-2 px-2 text-neutral-500">{new Date(client.addedAt).toLocaleDateString()}</td>
                        <td className="py-2 px-2 text-right">
                          <Button size="sm" variant="ghost" onClick={() => setConfirmAction({ type: "removeClient", id: client.id })}>
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* API Keys */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              <CardTitle className="text-sm">{t("agency.apiKeys")}</CardTitle>
            </div>
            <CardDescription>{t("agency.apiKeysDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {generatedKey && (
              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">
                  {t("agency.newKeyNotice")}
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-white dark:bg-neutral-800 rounded border text-xs font-mono break-all">
                    {generatedKey}
                  </code>
                  <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(generatedKey)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <button onClick={() => setGeneratedKey(null)} className="text-xs text-green-600 mt-2 hover:underline">
                  {t("agency.dismiss")}
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <Input
                placeholder={t("agency.keyLabelPlaceholder")}
                value={newKeyLabel}
                onChange={(e) => setNewKeyLabel(e.target.value)}
                className="flex-1"
              />
              <Button size="sm" onClick={generateApiKey} disabled={generatingKey || !newKeyLabel}>
                {generatingKey ? "..." : t("agency.generate")}
              </Button>
            </div>

            {agency.apiKeys.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">{t("agency.noApiKeys")}</p>
            ) : (
              <div className="space-y-2">
                {agency.apiKeys.map((key) => (
                  <div key={key.id} className="flex items-center justify-between p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800">
                    <div>
                      <span className="font-mono text-sm text-neutral-700 dark:text-neutral-300">{key.keyPrefix}...</span>
                      <span className="ml-2 text-xs text-neutral-500">{key.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                        {key.lastUsedAt ? t("agency.keyUsed", { date: new Date(key.lastUsedAt).toLocaleDateString() }) : t("agency.keyNeverUsed")}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmAction({ type: "revokeKey", id: key.id })}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Plan & Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("agency.planUsage")}</CardTitle>
            <CardDescription>{t("agency.planUsageDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Badge>{agency.plan}</Badge>
              <span className="text-sm text-neutral-600 dark:text-neutral-400">
                {t("agency.usage", { used: String(agency._count.clients), max: String(agency.maxClients) })}
              </span>
            </div>
            <div className="mt-3 w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
              <div
                className="bg-neutral-900 dark:bg-white h-2 rounded-full transition-all"
                style={{ width: `${Math.min((agency._count.clients / agency.maxClients) * 100, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>
      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.type === "removeClient" ? t("agency.removeClientTitle") : t("agency.revokeKeyTitle")}
        description={confirmAction?.type === "removeClient" ? t("agency.removeClientDesc") : t("agency.revokeKeyDesc")}
        confirmLabel={confirmAction?.type === "removeClient" ? t("agency.remove") : t("agency.revoke")}
        variant="danger"
        onConfirm={() => {
          if (confirmAction?.type === "removeClient") removeClient(confirmAction.id);
          else if (confirmAction?.type === "revokeKey") revokeApiKey(confirmAction.id);
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </AppShell>
  );
}

export default function AgencyDashboard() {
  return (
    <FeatureGate feature="agency">
      <AgencyDashboardInner />
    </FeatureGate>
  );
}
