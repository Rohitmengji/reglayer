"use client";

/**
 * RegLayer — public Color-Vision Simulator (/tools/color-vision)
 *
 * Enter a color, see it as the ~300M people with color-vision deficiencies do —
 * protanopia, deuteranopia, tritanopia, achromatopsia. Client-side via the pure
 * engine in @/lib/a11y/color-vision (no API, no auth).
 */
import { useMemo, useState } from "react";
import { PublicHeader } from "@/components/layout/public-header";
import { Footer } from "@/components/layout/footer";
import { useI18n } from "@/components/i18n-provider";
import { ToolsBackLink } from "@/components/tools/tools-back-link";
import { simulateColorVision } from "@/lib/a11y/color-vision";
import { parseColor, toHex } from "@/lib/a11y/contrast";

// CVD type names are medical terms — kept in English (like spec enum labels).
const TYPES: { key: keyof ReturnType<typeof simulateColorVision>; name: string; hint: string }[] = [
  { key: "original", name: "Original", hint: "Typical vision" },
  { key: "protanopia", name: "Protanopia", hint: "Red-blind (~1% of men)" },
  { key: "deuteranopia", name: "Deuteranopia", hint: "Green-blind (most common)" },
  { key: "tritanopia", name: "Tritanopia", hint: "Blue-blind (rare)" },
  { key: "achromatopsia", name: "Achromatopsia", hint: "No color at all" },
];

export default function ColorVisionToolPage() {
  const { t } = useI18n();
  const [color, setColor] = useState("#2563eb");

  const sim = useMemo(() => {
    try {
      return simulateColorVision(color);
    } catch {
      return null;
    }
  }, [color]);

  const pickerHex = useMemo(() => {
    const rgb = parseColor(color);
    return rgb ? toHex(rgb) : "#000000";
  }, [color]);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <div className="mb-4"><ToolsBackLink /></div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">{t("tools.colorVision.title")}</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">{t("tools.colorVision.subtitle")}</p>

        <div className="mt-8 max-w-sm space-y-1.5">
          <label htmlFor="cvd-color" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{t("tools.colorVision.colorLabel")}</label>
          <div className="flex items-center gap-2">
            <input type="color" aria-label={t("tools.colorVision.colorLabel")} value={pickerHex} onChange={(e) => setColor(e.target.value)} className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-neutral-200 dark:border-neutral-700 bg-transparent" />
            <input id="cvd-color" type="text" spellCheck={false} value={color} onChange={(e) => setColor(e.target.value)} className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm font-mono dark:bg-neutral-800 dark:text-neutral-100" />
          </div>
        </div>

        {!sim ? (
          <p className="mt-6 rounded-lg bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">{t("tools.contrast.invalid")}</p>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-5">
            {TYPES.map((tp) => (
              <div key={tp.key} className="text-center">
                <div className="h-24 w-full rounded-xl border border-neutral-200 dark:border-neutral-700" style={{ background: sim[tp.key] }} aria-hidden="true" />
                <p className="mt-2 text-sm font-semibold text-neutral-900 dark:text-white">{tp.name}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{tp.hint}</p>
                <code className="text-xs text-neutral-400">{sim[tp.key]}</code>
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
