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
import { useSession } from "next-auth/react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageLoading } from "@/components/ui/page-loading";
import { PageError } from "@/components/ui/page-error";
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

export default function AgencyDashboard() {
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
      if (!res.ok) throw new Error("Failed to load agencies");
      const data = await res.json();
      if (data.canCreate) setCanCreate(true);
      if (data.agencies?.length > 0) {
        const agencyId = data.agencies[0].id;
        const detailRes = await fetch(`/api/agency/${agencyId}`);
        if (!detailRes.ok) throw new Error("Failed to load agency details");
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
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    fetch("/api/agency")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load agencies");
        return res.json();
      })
      .then(async (data) => {
        if (data.canCreate) setCanCreate(true);
        if (data.agencies?.length > 0) {
          const agencyId = data.agencies[0].id;
          const detailRes = await fetch(`/api/agency/${agencyId}`);
          if (!detailRes.ok) throw new Error("Failed to load agency details");
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
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [session]);

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
        throw new Error(data.error || "Failed to create agency");
      }
      setShowCreateForm(false);
      await loadAgency();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
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
      if (!res.ok) throw new Error("Failed to save branding");
      await loadAgency();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
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
        throw new Error(err.error || "Failed to add client");
      }
      setNewClientName("");
      setNewClientEmail("");
      setShowAddClient(false);
      await loadAgency();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setAddingClient(false);
    }
  };

  const removeClient = async (clientId: string) => {
    if (!agency) return;
    if (!confirm("Remove this client? Their workspace data will remain.")) return;
    try {
      await fetch(`/api/agency/${agency.id}/clients/${clientId}`, { method: "DELETE" });
      await loadAgency();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    }
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
      if (!res.ok) throw new Error("Failed to generate key");
      const data = await res.json();
      setGeneratedKey(data.apiKey.key);
      setNewKeyLabel("");
      await loadAgency();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setGeneratingKey(false);
    }
  };

  const revokeApiKey = async (keyId: string) => {
    if (!agency) return;
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    try {
      await fetch(`/api/agency/${agency.id}/api-keys/${keyId}`, { method: "DELETE" });
      await loadAgency();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    }
  };

  if (loading) {
    return (
      <AppShell>
        <PageLoading message="Loading agency settings..." />
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
              White-label accessibility scanning under your own brand.
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
                  <CardTitle className="text-sm">Create Agency</CardTitle>
                </div>
                <CardDescription>Set up a new white-label agency</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="agencyName" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Agency Name
                  </label>
                  <Input
                    id="agencyName"
                    value={createName}
                    onChange={(e) => {
                      setCreateName(e.target.value);
                      setCreateSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                    }}
                    placeholder="My Accessibility Agency"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="agencySlug" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    URL Slug
                  </label>
                  <Input
                    id="agencySlug"
                    value={createSlug}
                    onChange={(e) => setCreateSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="my-agency"
                    className="font-mono"
                  />
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">{createSlug || "my-agency"}.reglayer.dev</p>
                </div>
                <Button
                  onClick={createAgency}
                  disabled={creatingAgency || !createName || !createSlug}
                >
                  {creatingAgency ? "Creating..." : "Create Agency"}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Building2 className="h-10 w-10 mx-auto text-neutral-300 dark:text-neutral-600 mb-3" />
                <p className="text-neutral-600 dark:text-neutral-400 font-medium">No agency assigned</p>
                <p className="text-sm text-neutral-500 dark:text-neutral-500 mt-1">
                  Contact your admin to set up an agency for your account.
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
          title="Couldn\u2019t load agency"
          message="We\u2019re having trouble loading your agency settings. Please try again."
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
            Manage your white-label brand, clients, and API access.
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            <button onClick={() => setError(null)} className="text-xs text-red-500 mt-1 hover:underline">Dismiss</button>
          </div>
        )}

        {/* Branding */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              <CardTitle className="text-sm">Branding</CardTitle>
            </div>
            <CardDescription>Customize how your agency appears to clients</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="brandName" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Brand Name
                </label>
                <Input
                  id="brandName"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="supportEmail" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Support Email
                </label>
                <Input
                  id="supportEmail"
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  placeholder="support@youragency.com"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Primary Color
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
                    aria-label="Primary color hex"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Accent Color
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
                    aria-label="Accent color hex"
                  />
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 p-4">
              <p className="text-xs text-neutral-500 mb-2 font-medium">Preview</p>
              <div className="flex items-center gap-3">
                <span className="font-bold text-lg" style={{ color: primaryColor }}>{brandName}</span>
              </div>
              <button
                type="button"
                className="mt-2 px-4 py-1.5 rounded-md text-white text-sm font-medium"
                style={{ backgroundColor: primaryColor }}
              >
                Sample Button
              </button>
            </div>

            <Button onClick={saveBranding} disabled={savingBrand} size="sm">
              {savingBrand ? "Saving..." : "Save Branding"}
            </Button>
          </CardContent>
        </Card>

        {/* Clients */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                <CardTitle className="text-sm">Clients ({agency._count.clients} / {agency.maxClients})</CardTitle>
              </div>
              <Button size="sm" onClick={() => setShowAddClient(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Client
              </Button>
            </div>
            <CardDescription>Manage client accounts under your agency</CardDescription>
          </CardHeader>
          <CardContent>
            {showAddClient && (
              <div className="mb-4 p-4 rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    placeholder="Client name"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                  />
                  <Input
                    type="email"
                    placeholder="Contact email"
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
                    {addingClient ? "Adding..." : "Add"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowAddClient(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {agency.clients.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">No clients yet. Add your first client above.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 dark:border-neutral-700">
                      <th className="text-left py-2 px-2 font-medium text-neutral-600 dark:text-neutral-400">Client</th>
                      <th className="text-left py-2 px-2 font-medium text-neutral-600 dark:text-neutral-400">Email</th>
                      <th className="text-left py-2 px-2 font-medium text-neutral-600 dark:text-neutral-400">Status</th>
                      <th className="text-left py-2 px-2 font-medium text-neutral-600 dark:text-neutral-400">Added</th>
                      <th className="text-right py-2 px-2 font-medium text-neutral-600 dark:text-neutral-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agency.clients.map((client) => (
                      <tr key={client.id} className="border-b border-neutral-100 dark:border-neutral-800">
                        <td className="py-2 px-2 text-neutral-900 dark:text-neutral-100">{client.clientName}</td>
                        <td className="py-2 px-2 text-neutral-600 dark:text-neutral-400">{client.contactEmail}</td>
                        <td className="py-2 px-2">
                          <Badge variant={client.isActive ? "default" : "secondary"}>
                            {client.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="py-2 px-2 text-neutral-500">{new Date(client.addedAt).toLocaleDateString()}</td>
                        <td className="py-2 px-2 text-right">
                          <Button size="sm" variant="ghost" onClick={() => removeClient(client.id)}>
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
              <CardTitle className="text-sm">API Keys</CardTitle>
            </div>
            <CardDescription>Generate keys for programmatic access</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {generatedKey && (
              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">
                  New API Key — copy it now (shown only once):
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
                  Dismiss
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <Input
                placeholder="Key label (e.g. Production)"
                value={newKeyLabel}
                onChange={(e) => setNewKeyLabel(e.target.value)}
                className="flex-1"
              />
              <Button size="sm" onClick={generateApiKey} disabled={generatingKey || !newKeyLabel}>
                {generatingKey ? "..." : "Generate"}
              </Button>
            </div>

            {agency.apiKeys.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">No API keys yet.</p>
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
                        {key.lastUsedAt ? `Used ${new Date(key.lastUsedAt).toLocaleDateString()}` : "Never used"}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => revokeApiKey(key.id)}>
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
            <CardTitle className="text-sm">Plan & Usage</CardTitle>
            <CardDescription>Your current agency plan</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Badge>{agency.plan}</Badge>
              <span className="text-sm text-neutral-600 dark:text-neutral-400">
                {agency._count.clients} / {agency.maxClients} clients used
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
    </AppShell>
  );
}
