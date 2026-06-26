"use client";

/**
 * RegLayer — SSO role-mapping editor (IdP group → workspace role, #25).
 *
 * Expandable per-connection editor. Loads the current mappings on open, edits
 * rows in local state, and PUTs the full set (replace-all). Role is capped at
 * ADMIN — SSO never mints OWNER (enforced again server-side).
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ModernSelect } from "@/components/ui/modern-select";
import { useI18n } from "@/components/i18n-provider";
import { Plus, Trash2, Save } from "lucide-react";
import type { MappableRole, RoleMappingView } from "./types";

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin" },
  { value: "MEMBER", label: "Member" },
  { value: "VIEWER", label: "Viewer" },
];

/** A row carries a stable client key so React reconciles editable rows correctly on delete. */
interface EditorRow extends RoleMappingView {
  key: string;
}

export function RoleMappingEditor({ connectionId }: { connectionId: string }) {
  const { t } = useI18n();
  const keyCounter = useRef(0);
  const [rows, setRows] = useState<EditorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sso/connections/${connectionId}/role-mappings`)
      .then((res) => {
        if (!res.ok) throw new Error("load");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setRows((data.mappings || []).map((m: RoleMappingView) => ({ key: String(keyCounter.current++), idpGroup: m.idpGroup, role: m.role })));
          setLoadError(false);
        }
      })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [connectionId]);

  function updateRow(i: number, patch: Partial<RoleMappingView>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { key: String(keyCounter.current++), idpGroup: "", role: "MEMBER" }]);
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }

  async function save() {
    const cleaned = rows.map((r) => ({ idpGroup: r.idpGroup.trim(), role: r.role })).filter((r) => r.idpGroup.length > 0);
    const groups = cleaned.map((r) => r.idpGroup.toLowerCase());
    if (new Set(groups).size !== groups.length) {
      toast.error(t("sso.dupGroups"));
      return;
    }
    setSaving(true);
    const toastId = toast.loading(t("sso.savingMappings"));
    try {
      const res = await fetch(`/api/sso/connections/${connectionId}/role-mappings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: cleaned }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || t("sso.saveMappingsFailed"), { id: toastId });
        return;
      }
      setRows((data.mappings || cleaned).map((m: RoleMappingView) => ({ key: String(keyCounter.current++), idpGroup: m.idpGroup, role: m.role })));
      toast.success(t("sso.mappingsSaved"), { id: toastId });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-xs text-neutral-500 py-2">{t("sso.loadingMappings")}</p>;
  if (loadError) return <p className="text-xs text-red-600 py-2">{t("sso.loadMappingsError")}</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{t("sso.mappingHelp")}</p>
      {rows.length === 0 && <p className="text-xs text-neutral-400">{t("sso.noMappings")}</p>}
      {rows.map((row, i) => (
        <div key={row.key} className="flex items-center gap-2">
          <input
            type="text"
            placeholder={t("sso.groupPlaceholder")}
            value={row.idpGroup}
            onChange={(e) => updateRow(i, { idpGroup: e.target.value })}
            className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-sm dark:bg-neutral-800 dark:text-neutral-100"
          />
          <ModernSelect options={ROLE_OPTIONS} value={row.role} onChange={(v) => updateRow(i, { role: v as MappableRole })} />
          <button
            type="button"
            onClick={() => removeRow(i)}
            className="rounded-md p-1.5 text-neutral-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            title={t("sso.removeMapping")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> {t("sso.addMapping")}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 dark:bg-white px-2.5 py-1.5 text-xs font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 transition-colors"
        >
          <Save className="h-3.5 w-3.5" /> {saving ? t("sso.saving") : t("sso.saveMappings")}
        </button>
      </div>
    </div>
  );
}
