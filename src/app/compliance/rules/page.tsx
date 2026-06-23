"use client";

/**
 * RegLayer — Custom Compliance Rules management
 *
 * WHY: Enterprise teams need to define organization-specific compliance policies
 *      that are evaluated on every scan (beyond the built-in WCAG rule sets).
 * WHAT: List / create / edit / enable / delete custom rules. Enterprise-gated.
 * HOW: Client page over /api/rules. Reuses ui primitives + the UpgradeGate locked
 *      state. Rule type determines which config field is shown.
 */

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, SlidersHorizontal } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { useI18n } from "@/components/i18n-provider";
import { useFeatures } from "@/hooks/use-features";
import { UpgradeGate } from "@/components/ui/upgrade-gate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ModernSelect } from "@/components/ui/modern-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type RuleType = "THRESHOLD" | "RULE_REQUIRED" | "IMPACT_BUDGET" | "CRITERION_REQUIRED";
type Impact = "critical" | "serious" | "moderate" | "minor";

interface Rule {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  type: RuleType;
  severity: Impact;
  config: Record<string, unknown>;
}

interface FormState {
  id: string | null;
  name: string;
  description: string;
  type: RuleType;
  severity: Impact;
  enabled: boolean;
  minScore: string;
  axeRuleId: string;
  impact: Impact;
  maxCount: string;
  criterion: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: "",
  description: "",
  type: "THRESHOLD",
  severity: "serious",
  enabled: true,
  minScore: "90",
  axeRuleId: "",
  impact: "critical",
  maxCount: "0",
  criterion: "",
};

const inputClass =
  "w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white";

export default function CustomRulesPage() {
  const { t } = useI18n();
  const { hasFeature, loading: featuresLoading } = useFeatures();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Rule | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/rules");
      if (!res.ok) return;
      const data = await res.json();
      setRules(data.rules ?? []);
    } catch {
      /* gated or offline — handled by the gate / empty state */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: kick off the initial client-side data fetch (sets loading state synchronously)
    load();
  }, [load]);

  const typeOptions = [
    { value: "THRESHOLD", label: t("rules.typeThreshold") },
    { value: "RULE_REQUIRED", label: t("rules.typeRuleRequired") },
    { value: "IMPACT_BUDGET", label: t("rules.typeImpactBudget") },
    { value: "CRITERION_REQUIRED", label: t("rules.typeCriterionRequired") },
  ];
  const impactOptions: { value: Impact; label: string }[] = [
    { value: "critical", label: "Critical" },
    { value: "serious", label: "Serious" },
    { value: "moderate", label: "Moderate" },
    { value: "minor", label: "Minor" },
  ];

  function buildConfig(f: FormState): Record<string, unknown> {
    switch (f.type) {
      case "THRESHOLD":
        return { minScore: Number(f.minScore) };
      case "RULE_REQUIRED":
        return { axeRuleId: f.axeRuleId.trim() };
      case "IMPACT_BUDGET":
        return { impact: f.impact, maxCount: Number(f.maxCount) };
      case "CRITERION_REQUIRED":
        return { criterion: f.criterion.trim() };
    }
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        enabled: form.enabled,
        severity: form.severity,
        ...(form.id ? {} : { type: form.type }),
        config: buildConfig(form),
      };
      const res = await fetch(form.id ? `/api/rules/${form.id}` : "/api/rules", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toast.error(t("rules.saveError"));
        return;
      }
      toast.success(t("rules.saved"));
      setForm(null);
      await load();
    } catch {
      toast.error(t("rules.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(rule: Rule) {
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)));
    const res = await fetch(`/api/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    if (!res.ok) {
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: rule.enabled } : r)));
      toast.error(t("rules.saveError"));
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/rules/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      setRules((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      toast.success(t("rules.deleted"));
    } else {
      toast.error(t("rules.saveError"));
    }
    setDeleteTarget(null);
  }

  function startEdit(rule: Rule) {
    const c = rule.config ?? {};
    setForm({
      id: rule.id,
      name: rule.name,
      description: rule.description ?? "",
      type: rule.type,
      severity: rule.severity,
      enabled: rule.enabled,
      minScore: String((c.minScore as number) ?? 90),
      axeRuleId: String((c.axeRuleId as string) ?? ""),
      impact: ((c.impact as Impact) ?? "critical"),
      maxCount: String((c.maxCount as number) ?? 0),
      criterion: String((c.criterion as string) ?? ""),
    });
  }

  function ruleSummary(rule: Rule): string {
    const c = rule.config ?? {};
    switch (rule.type) {
      case "THRESHOLD":
        return t("rules.summaryThreshold", { value: String(c.minScore ?? "") });
      case "RULE_REQUIRED":
        return t("rules.summaryRuleRequired", { value: String(c.axeRuleId ?? "") });
      case "IMPACT_BUDGET":
        return t("rules.summaryImpactBudget", { count: String(c.maxCount ?? ""), impact: String(c.impact ?? "") });
      case "CRITERION_REQUIRED":
        return t("rules.summaryCriterion", { value: String(c.criterion ?? "") });
    }
  }

  // Enterprise gate (client-side; the API enforces it server-side too).
  if (!featuresLoading && !hasFeature("customRules")) {
    return (
      <AppShell>
        <UpgradeGate featureName={t("rules.title")} requiredPlan="ENTERPRISE" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t("rules.title")}</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400 max-w-xl">{t("rules.subtitle")}</p>
          </div>
          {!form && (
            <Button onClick={() => setForm({ ...EMPTY_FORM })} className="gap-1.5">
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("rules.add")}
            </Button>
          )}
        </div>

        {form && (
          <div className="mt-6 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
            <div className="space-y-4">
              <div>
                <label htmlFor="rule-name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{t("rules.name")}</label>
                <input id="rule-name" className={inputClass} value={form.name} maxLength={100}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("rules.namePlaceholder")} />
              </div>
              <div>
                <label htmlFor="rule-desc" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{t("rules.description")}</label>
                <input id="rule-desc" className={inputClass} value={form.description} maxLength={500}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("rules.descriptionPlaceholder")} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{t("rules.type")}</label>
                  {form.id ? (
                    <div className={`${inputClass} bg-neutral-50 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400`}>
                      {typeOptions.find((o) => o.value === form.type)?.label}
                    </div>
                  ) : (
                    <ModernSelect options={typeOptions} value={form.type}
                      onChange={(v) => setForm({ ...form, type: v as RuleType })} />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{t("rules.severity")}</label>
                  <ModernSelect options={impactOptions} value={form.severity}
                    onChange={(v) => setForm({ ...form, severity: v as Impact })} />
                </div>
              </div>

              {/* Type-specific config */}
              {form.type === "THRESHOLD" && (
                <div>
                  <label htmlFor="cfg-minscore" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{t("rules.fieldMinScore")}</label>
                  <input id="cfg-minscore" type="number" min={0} max={100} className={inputClass} value={form.minScore}
                    onChange={(e) => setForm({ ...form, minScore: e.target.value })} />
                </div>
              )}
              {form.type === "RULE_REQUIRED" && (
                <div>
                  <label htmlFor="cfg-axe" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{t("rules.fieldAxeRuleId")}</label>
                  <input id="cfg-axe" className={inputClass} value={form.axeRuleId}
                    onChange={(e) => setForm({ ...form, axeRuleId: e.target.value })} placeholder={t("rules.fieldAxeRuleIdPlaceholder")} />
                </div>
              )}
              {form.type === "IMPACT_BUDGET" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{t("rules.fieldImpact")}</label>
                    <ModernSelect options={impactOptions} value={form.impact}
                      onChange={(v) => setForm({ ...form, impact: v as Impact })} />
                  </div>
                  <div>
                    <label htmlFor="cfg-max" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{t("rules.fieldMaxCount")}</label>
                    <input id="cfg-max" type="number" min={0} className={inputClass} value={form.maxCount}
                      onChange={(e) => setForm({ ...form, maxCount: e.target.value })} />
                  </div>
                </div>
              )}
              {form.type === "CRITERION_REQUIRED" && (
                <div>
                  <label htmlFor="cfg-crit" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{t("rules.fieldCriterion")}</label>
                  <input id="cfg-crit" className={inputClass} value={form.criterion}
                    onChange={(e) => setForm({ ...form, criterion: e.target.value })} placeholder={t("rules.fieldCriterionPlaceholder")} />
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                  <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-600" />
                  {t("rules.enabled")}
                </label>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setForm(null)} disabled={saving}>{t("rules.cancel")}</Button>
                  <Button onClick={save} disabled={saving || !form.name.trim()}>{t("rules.save")}</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* List */}
        <div className="mt-6 space-y-3">
          {loading ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">…</p>
          ) : rules.length === 0 && !form ? (
            <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center">
              <SlidersHorizontal className="mx-auto h-8 w-8 text-neutral-400" aria-hidden="true" />
              <h2 className="mt-3 text-base font-semibold text-neutral-900 dark:text-white">{t("rules.empty")}</h2>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t("rules.emptyDesc")}</p>
            </div>
          ) : (
            rules.map((rule) => (
              <div key={rule.id} className="flex items-start justify-between gap-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-neutral-900 dark:text-white">{rule.name}</span>
                    <Badge variant={rule.enabled ? "success" : "secondary"}>
                      {rule.enabled ? t("rules.statusActive") : t("rules.statusPaused")}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{ruleSummary(rule)}</p>
                  {rule.description && <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-500">{rule.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => toggle(rule)} className="rounded-md px-2 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 dark:focus-visible:ring-white">
                    {rule.enabled ? t("rules.pause") : t("rules.resume")}
                  </button>
                  <button onClick={() => startEdit(rule)} aria-label={t("rules.edit")} className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 dark:focus-visible:ring-white">
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button onClick={() => setDeleteTarget(rule)} aria-label={t("rules.delete")} className="rounded-md p-1.5 text-neutral-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t("rules.deleteConfirm")}
        description={t("rules.deleteConfirmDesc")}
        confirmLabel={t("rules.delete")}
        onConfirm={remove}
        onCancel={() => setDeleteTarget(null)}
        variant="danger"
      />
    </AppShell>
  );
}
