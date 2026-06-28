"use client";

/**
 * RegLayer — Public Contrast Checker & Fixer (/tools/contrast)
 *
 * A free, client-side WCAG contrast tool: enter a text + background color, see the
 * ratio and AA/AAA pass matrix live, and — when it fails — get the nearest
 * accessible color that PRESERVES the hue (one click to apply). Computes entirely
 * in the browser via the pure engine in @/lib/a11y/contrast (no API, no auth).
 */
import { useMemo, useState } from "react";
import { PublicHeader } from "@/components/layout/public-header";
import { Footer } from "@/components/layout/footer";
import { useI18n } from "@/components/i18n-provider";
import { ToolsBackLink } from "@/components/tools/tools-back-link";
import { Check, X, Copy } from "lucide-react";
import { analyzeContrast, parseColor, toHex } from "@/lib/a11y/contrast";

function safeHex(input: string, fallback: string): string {
  const rgb = parseColor(input);
  return rgb ? toHex(rgb) : fallback;
}

function ColorField({ id, label, value, onChange, fallback }: {
  id: string; label: string; value: string; onChange: (v: string) => void; fallback: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={safeHex(value, fallback)}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-neutral-200 dark:border-neutral-700 bg-transparent"
        />
        <input
          id={id}
          type="text"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm font-mono dark:bg-neutral-800 dark:text-neutral-100"
        />
      </div>
    </div>
  );
}

export default function ContrastToolPage() {
  const { t } = useI18n();
  const [fg, setFg] = useState("#999999");
  const [bg, setBg] = useState("#ffffff");
  const [largeText, setLargeText] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const report = useMemo(() => {
    try {
      return analyzeContrast(fg, bg, { level: "AA", largeText });
    } catch {
      return null;
    }
  }, [fg, bg, largeText]);

  function copy(hex: string) {
    navigator.clipboard?.writeText(hex).then(
      () => {
        setCopied(hex);
        setTimeout(() => setCopied((c) => (c === hex ? null : c)), 1500);
      },
      () => {},
    );
  }

  const previewFg = safeHex(fg, "#000000");
  const previewBg = safeHex(bg, "#ffffff");

  const matrix: { label: string; pass: boolean | undefined }[] = [
    { label: `AA · ${t("tools.contrast.normal")}`, pass: report?.passes.aaNormal },
    { label: `AA · ${t("tools.contrast.large")}`, pass: report?.passes.aaLarge },
    { label: `AAA · ${t("tools.contrast.normal")}`, pass: report?.passes.aaaNormal },
    { label: `AAA · ${t("tools.contrast.large")}`, pass: report?.passes.aaaLarge },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <div className="mb-4"><ToolsBackLink /></div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">{t("tools.contrast.title")}</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">{t("tools.contrast.subtitle")}</p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <ColorField id="fg" label={t("tools.contrast.foreground")} value={fg} onChange={setFg} fallback="#000000" />
          <ColorField id="bg" label={t("tools.contrast.background")} value={bg} onChange={setBg} fallback="#ffffff" />
        </div>

        {/* Live preview */}
        <div className="mt-6 rounded-xl border border-neutral-200 dark:border-neutral-700 p-8 text-center" style={{ background: previewBg }}>
          <p className="text-2xl font-semibold" style={{ color: previewFg }}>{t("tools.contrast.sample")}</p>
          <p className="mt-2 text-sm" style={{ color: previewFg }}>{t("tools.contrast.sample")}</p>
        </div>

        <label className="mt-4 inline-flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <input type="checkbox" checked={largeText} onChange={(e) => setLargeText(e.target.checked)} className="h-4 w-4 rounded border-neutral-300" />
          {t("tools.contrast.largeToggle")}
        </label>

        {/* Results */}
        <div className="mt-8" aria-live="polite">
          {!report ? (
            <p className="rounded-lg bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">{t("tools.contrast.invalid")}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">{t("tools.contrast.ratio")}</p>
                  <p className="text-5xl font-black tabular-nums text-neutral-900 dark:text-white">{report.ratio}<span className="text-2xl font-bold text-neutral-400">:1</span></p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {matrix.map((m) => (
                    <span
                      key={m.label}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${m.pass ? "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300" : "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300"}`}
                    >
                      {m.pass ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <X className="h-3.5 w-3.5" aria-hidden="true" />}
                      <span>{m.label}</span>
                      <span className="sr-only">{m.pass ? t("tools.contrast.pass") : t("tools.contrast.fail")}</span>
                    </span>
                  ))}
                </div>
              </div>

              {report.suggestion && (
                <div className="mt-6 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5">
                  {report.suggestion.meetsTarget ? (
                    <>
                      <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{t("tools.contrast.suggestion")}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <span className="h-10 w-10 shrink-0 rounded-lg border border-neutral-200 dark:border-neutral-700" style={{ background: report.suggestion.recommended.hex }} aria-hidden="true" />
                        <code className="font-mono text-lg font-semibold text-neutral-900 dark:text-white">{report.suggestion.recommended.hex}</code>
                        <span className="text-sm text-neutral-500">{report.suggestion.recommended.ratio}:1</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setFg(report.suggestion!.recommended.hex)} className="rounded-lg bg-neutral-900 dark:bg-white px-3 py-1.5 text-sm font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors">
                            {t("tools.contrast.use")}
                          </button>
                          <button onClick={() => copy(report.suggestion!.recommended.hex)} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors">
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" /> {copied === report.suggestion.recommended.hex ? t("common.copied") : t("common.copy")}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      {t("tools.contrast.impossible", {
                        level: report.target.level,
                        hex: report.suggestion.recommended.hex,
                        ratio: String(report.suggestion.recommended.ratio),
                      })}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
