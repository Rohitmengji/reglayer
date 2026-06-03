"use client";

/**
 * RegLayer — Remediation Dashboard Page
 *
 * WHY: Teams need to track remediation progress and get AI-powered fix suggestions.
 * WHAT: Shows violations with AI-generated code fixes, remediation status tracking.
 * HOW: Fetches violations, calls /api/remediate for fix suggestions, tracks status changes.
 */

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wand2, Code, Globe, Copy, Check } from "lucide-react";

export default function RemediationPage() {
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState("https://");
  const [result, setResult] = useState<{ url: string; totalFixes: number; fixes: Array<{ category: string; description: string; element?: string }> } | null>(null);
  const [copied, setCopied] = useState(false);
  const [scriptSnippet, setScriptSnippet] = useState("");

  async function runRemediation() {
    setLoading(true);
    try {
      const res = await fetch("/api/remediate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          fixes: ["lang", "skip-links", "landmarks", "alt-text", "form-labels", "button-labels", "focus-order"],
        }),
      });
      if (res.ok) {
        setResult(await res.json());
      } else {
        const err = await res.json();
        alert(err.error || "Remediation failed");
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadScript() {
    const res = await fetch("/api/remediate/script");
    if (res.ok) {
      const text = await res.text();
      setScriptSnippet(text);
    }
  }

  function copyScript() {
    const tag = `<script src="${window.location.origin}/api/remediate/script"></script>`;
    navigator.clipboard.writeText(tag);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Auto-Remediation</h1>
          <p className="text-muted-foreground">
            Automatically fix accessibility issues. Deploy a script tag or run server-side remediation.
          </p>
        </div>

        {/* Drop-in Script */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-3">
              <Code className="h-5 w-5" />
              <h3 className="font-semibold">Drop-in Script (Client-Side)</h3>
              <Badge>Instant Fix</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Add this single script tag to your site. It automatically fixes common accessibility issues on page load — no build step needed.
            </p>
            <div className="bg-muted rounded-lg p-4 font-mono text-sm relative overflow-x-auto">
              <code className="break-all">{`<script src="${typeof window !== "undefined" ? window.location.origin : ""}/api/remediate/script"></script>`}</code>
              <Button
                size="sm"
                variant="ghost"
                className="absolute top-2 right-2"
                onClick={copyScript}
              >
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              <p className="font-medium mb-1">Fixes applied:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Missing lang attribute</li>
                <li>Skip navigation link</li>
                <li>Image alt text (derived from filename/context)</li>
                <li>Form input labels (from placeholder/name)</li>
                <li>Button labels (from icon/class)</li>
                <li>Positive tabindex removal</li>
                <li>Navigation landmark labels</li>
              </ul>
            </div>
            {!scriptSnippet && (
              <Button variant="outline" size="sm" className="mt-3" onClick={loadScript}>
                View Full Script
              </Button>
            )}
            {scriptSnippet && (
              <pre className="mt-3 bg-muted rounded-lg p-4 text-xs overflow-x-auto max-h-48 overflow-y-auto">
                {scriptSnippet}
              </pre>
            )}
          </CardContent>
        </Card>

        {/* Server-Side Remediation */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="h-5 w-5" />
              <h3 className="font-semibold">Server-Side Remediation</h3>
              <Badge variant="secondary">Pro</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Fetch a URL and apply server-side DOM transforms. Returns the fixed HTML.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="flex-1 min-w-0 rounded-md border px-3 py-2 text-sm bg-background"
              />
              <Button onClick={runRemediation} disabled={loading || !url.startsWith("http")} size="sm" className="shrink-0 sm:size-default">
                <Wand2 className="h-4 w-4 mr-2" />
                {loading ? "Fixing..." : "Remediate"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Remediation Results</h3>
                <Badge variant={result.totalFixes > 0 ? "default" : "secondary"}>
                  {result.totalFixes} fixes applied
                </Badge>
              </div>
              {result.totalFixes === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No issues found to fix on this page. The site may already be well-structured.
                </p>
              ) : (
                <div className="space-y-2">
                  {result.fixes.map((fix, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                      <Wand2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{fix.description}</p>
                        {fix.element && (
                          <code className="text-xs text-muted-foreground mt-1 block">{fix.element}</code>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
