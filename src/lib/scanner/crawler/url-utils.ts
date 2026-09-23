/**
 * RegLayer — Crawler URL utilities
 *
 * Pure URL handling for the discovery stage: normalization, deduplication,
 * origin boundaries, and skip rules. Kept free of browser/database imports so
 * the rules that decide *what gets crawled* can be unit-tested on their own.
 */

/**
 * Marketing/analytics parameters that never change what a page renders. Left in
 * place they fork one page into many "unique" URLs, so the crawler re-scans the
 * same content and burns the page budget on duplicates.
 */
export const TRACKING_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
  "gclid", "gbraid", "wbraid", "fbclid", "msclkid", "dclid", "yclid",
  "mc_cid", "mc_eid", "igshid", "_ga", "_gl", "vero_id", "s_kwcid",
];

/** Framework params that request a data payload rather than a different page. */
const FRAMEWORK_PARAMS = ["_rsc", "__nextDataReq"];

/**
 * Canonical form used as the crawler's dedupe key. Drops the fragment, strips
 * framework/tracking noise, orders the remaining query so parameter order can't
 * fork a page, and removes a trailing slash (except on root).
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    for (const p of FRAMEWORK_PARAMS) parsed.searchParams.delete(p);
    for (const p of TRACKING_PARAMS) parsed.searchParams.delete(p);
    parsed.searchParams.sort();
    let normalized = parsed.toString();
    if (normalized.endsWith("/") && parsed.pathname !== "/") {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url;
  }
}

export function isSameOrigin(url: string, origin: string): boolean {
  try { return new URL(url).origin === origin; } catch { return false; }
}

export function matchesPatterns(url: string, include?: string[], exclude?: string[]): boolean {
  if (exclude?.length) {
    for (const p of exclude) { if (url.includes(p)) return false; }
  }
  if (include?.length) {
    return include.some((p) => url.includes(p));
  }
  return true;
}

export const SKIP_EXTENSIONS = new Set([
  ".pdf", ".zip", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
  ".mp4", ".webm", ".mp3", ".woff", ".woff2", ".ttf", ".eot",
  ".css", ".js", ".map", ".json", ".xml", ".rss",
]);

export const SKIP_PATHS = ["/api/", "/_next/", "/static/", "/__nextjs", "/favicon"];

export function shouldSkipUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    for (const ext of SKIP_EXTENSIONS) { if (path.endsWith(ext)) return true; }
    for (const p of SKIP_PATHS) { if (path.includes(p)) return true; }
  } catch { return true; }
  return false;
}
