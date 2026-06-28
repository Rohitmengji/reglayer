"use client";

/**
 * RegLayer — Page structure & content insights panel (scan detail).
 *
 * Renders the post-scan heading-outline + readability + <html lang> insights
 * computed (purely) from the lightweight structure snapshot the scanner captured
 * into Scan.metadata.pageStructure. Renders nothing for scans with no capture
 * (older scans / capture failed), so it degrades gracefully.
 *
 * Copy is English to match the adjacent Deep Scan panel in scans/[id]/page.tsx.
 */
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FileText, Check, AlertTriangle } from "lucide-react";
import { computePageInsights, type PageStructureCapture } from "@/lib/a11y/page-insights";

export function PageStructureCard({ capture }: { capture?: PageStructureCapture }) {
  const insights = computePageInsights(capture);
  if (!insights) return null;
  const { headings, readability, lang } = insights;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FileText className="h-4 w-4" aria-hidden="true" />
          Page structure &amp; content
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {/* Language */}
        {lang.report && (
          <div>
            <p className="font-medium text-neutral-900 dark:text-white">Language (&lt;html lang&gt;)</p>
            {lang.report.valid ? (
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
                <Check className="h-3.5 w-3.5" aria-hidden="true" /> Valid: <code className="font-mono">{lang.value}</code>
              </p>
            ) : (
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  <code className="font-mono">{lang.value}</code> isn&apos;t a valid language tag
                  {lang.report.suggestion ? (<> — use <code className="font-mono font-semibold">{lang.report.suggestion}</code></>) : null}
                </span>
              </p>
            )}
          </div>
        )}

        {/* Heading structure */}
        {headings && (
          <div>
            <p className="font-medium text-neutral-900 dark:text-white">Heading structure</p>
            {headings.issues.length === 0 ? (
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
                <Check className="h-3.5 w-3.5" aria-hidden="true" /> Well-structured ({headings.outline.length} heading{headings.outline.length === 1 ? "" : "s"})
              </p>
            ) : (
              <ul className="mt-1 space-y-1">
                {headings.issues.slice(0, 10).map((iss, i) => (
                  <li key={i} className="text-xs text-amber-700 dark:text-amber-400">• {iss.message}</li>
                ))}
              </ul>
            )}
            {headings.outline.length > 0 && (
              <div className="mt-2 rounded-md bg-neutral-50 dark:bg-neutral-800 p-2 font-mono text-xs text-neutral-600 dark:text-neutral-300 max-h-48 overflow-y-auto">
                {headings.outline.slice(0, 30).map((o, i) => (
                  <div key={i} style={{ paddingLeft: `${o.depth * 12}px` }} className="truncate">
                    <span className="text-neutral-400">h{o.level}</span> {o.text || <span className="italic text-amber-600">(empty)</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Readability */}
        {readability && (
          <div>
            <p className="font-medium text-neutral-900 dark:text-white">Readability</p>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
              Reading ease <strong className="tabular-nums">{readability.fleschReadingEase}</strong> · grade{" "}
              <strong className="tabular-nums">{readability.fleschKincaidGrade}</strong> — {readability.level}
            </p>
            <p className={`mt-1 inline-flex items-center gap-1.5 text-xs ${readability.meetsWcagAaa ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}>
              {readability.meetsWcagAaa ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
              {readability.meetsWcagAaa ? "Meets the WCAG AAA reading level (3.1.5)" : "Above the WCAG AAA reading level (3.1.5)"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
