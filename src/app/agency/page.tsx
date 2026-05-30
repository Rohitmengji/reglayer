/**
 * RegLayer — Agency Admin Dashboard
 *
 * WHY: Agency owners manage their brand, clients, and API keys.
 * WHAT: Full admin page for white-label agency management.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";

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
  const { data: session } = useSession();
  const [agency, setAgency] = useState<Agency | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setError("No agency found. Contact admin to create one.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) loadAgency();
  }, [session, loadAgency]);

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
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
      </div>
    );
  }

  if (error && !agency) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  if (!agency) return null;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Agency Dashboard</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1">
          Manage your white-label brand, clients, and API access.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 text-xs mt-1 hover:underline">Dismiss</button>
        </div>
      )}

      {/* Branding Panel */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-zinc-100">Branding</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="brandName" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Brand Name
            </label>
            <input
              id="brandName"
              type="text"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            />
          </div>
          <div>
            <label htmlFor="supportEmail" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Support Email
            </label>
            <input
              id="supportEmail"
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              placeholder="support@youragency.com"
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            />
          </div>
          <div>
            <label htmlFor="primaryColor" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Primary Color
            </label>
            <div className="flex items-center gap-2">
              <input
                id="primaryColor"
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-10 rounded border border-zinc-300 dark:border-zinc-700 cursor-pointer"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="flex-1 px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono text-sm"
                aria-label="Primary color hex value"
              />
            </div>
          </div>
          <div>
            <label htmlFor="accentColor" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Accent Color
            </label>
            <div className="flex items-center gap-2">
              <input
                id="accentColor"
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-10 w-10 rounded border border-zinc-300 dark:border-zinc-700 cursor-pointer"
              />
              <input
                type="text"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="flex-1 px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono text-sm"
                aria-label="Accent color hex value"
              />
            </div>
          </div>
        </div>
        {/* Live Preview */}
        <div className="mt-4 p-4 rounded-lg border border-zinc-200 dark:border-zinc-700">
          <p className="text-xs text-zinc-500 mb-2">Preview</p>
          <div className="flex items-center gap-3 mb-3" style={{ color: primaryColor }}>
            <span className="font-bold text-lg">{brandName}</span>
          </div>
          <button
            type="button"
            className="px-4 py-2 rounded-md text-white text-sm font-medium"
            style={{ backgroundColor: primaryColor }}
          >
            Sample Button
          </button>
        </div>
        <button
          onClick={saveBranding}
          disabled={savingBrand}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
        >
          {savingBrand ? "Saving..." : "Save Branding"}
        </button>
      </section>

      {/* Client Management */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Clients ({agency._count.clients} / {agency.maxClients})
          </h2>
          <button
            onClick={() => setShowAddClient(true)}
            className="px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium"
          >
            Add Client
          </button>
        </div>

        {showAddClient && (
          <div className="mb-4 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Client name"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                className="px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              />
              <input
                type="email"
                placeholder="Contact email"
                value={newClientEmail}
                onChange={(e) => setNewClientEmail(e.target.value)}
                className="px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={addClient}
                disabled={addingClient || !newClientName || !newClientEmail}
                className="px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 text-sm"
              >
                {addingClient ? "Adding..." : "Add"}
              </button>
              <button
                onClick={() => setShowAddClient(false)}
                className="px-3 py-1.5 bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {agency.clients.length === 0 ? (
          <p className="text-zinc-500 text-sm">No clients yet. Add your first client above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="text-left py-2 px-2 font-medium text-zinc-600 dark:text-zinc-400">Client</th>
                  <th className="text-left py-2 px-2 font-medium text-zinc-600 dark:text-zinc-400">Email</th>
                  <th className="text-left py-2 px-2 font-medium text-zinc-600 dark:text-zinc-400">Status</th>
                  <th className="text-left py-2 px-2 font-medium text-zinc-600 dark:text-zinc-400">Added</th>
                  <th className="text-right py-2 px-2 font-medium text-zinc-600 dark:text-zinc-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {agency.clients.map((client) => (
                  <tr key={client.id} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-2 px-2 text-zinc-900 dark:text-zinc-100">{client.clientName}</td>
                    <td className="py-2 px-2 text-zinc-600 dark:text-zinc-400">{client.contactEmail}</td>
                    <td className="py-2 px-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        client.isActive
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}>
                        {client.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-zinc-500">{new Date(client.addedAt).toLocaleDateString()}</td>
                    <td className="py-2 px-2 text-right">
                      <button
                        onClick={() => removeClient(client.id)}
                        className="text-red-500 hover:text-red-700 text-xs"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* API Keys */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-zinc-100">API Keys</h2>

        {generatedKey && (
          <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">
              New API Key Generated — copy it now (shown only once):
            </p>
            <code className="block p-2 bg-white dark:bg-zinc-800 rounded border text-sm font-mono break-all">
              {generatedKey}
            </code>
            <button
              onClick={() => setGeneratedKey(null)}
              className="mt-2 text-xs text-green-600 hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="Key label (e.g. Production)"
            value={newKeyLabel}
            onChange={(e) => setNewKeyLabel(e.target.value)}
            className="flex-1 px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm"
          />
          <button
            onClick={generateApiKey}
            disabled={generatingKey || !newKeyLabel}
            className="px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium whitespace-nowrap"
          >
            {generatingKey ? "Generating..." : "Generate Key"}
          </button>
        </div>

        {agency.apiKeys.length === 0 ? (
          <p className="text-zinc-500 text-sm">No API keys yet.</p>
        ) : (
          <div className="space-y-2">
            {agency.apiKeys.map((key) => (
              <div key={key.id} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                <div>
                  <span className="font-mono text-sm text-zinc-700 dark:text-zinc-300">{key.keyPrefix}...</span>
                  <span className="ml-2 text-xs text-zinc-500">{key.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400">
                    {key.lastUsedAt ? `Used ${new Date(key.lastUsedAt).toLocaleDateString()}` : "Never used"}
                  </span>
                  <button
                    onClick={() => revokeApiKey(key.id)}
                    className="text-red-500 hover:text-red-700 text-xs"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Plan & Billing */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-zinc-100">Plan & Usage</h2>
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300">
            {agency.plan}
          </span>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {agency._count.clients} / {agency.maxClients} clients used
          </span>
        </div>
        <div className="mt-3 w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
          <div
            className="bg-indigo-600 h-2 rounded-full transition-all"
            style={{ width: `${Math.min((agency._count.clients / agency.maxClients) * 100, 100)}%` }}
          />
        </div>
      </section>
    </div>
  );
}
