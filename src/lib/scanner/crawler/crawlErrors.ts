/**
 * RegLayer — Crawl error humanization (PURE)
 *
 * Translates raw Playwright/Chromium/network error strings into plain-language,
 * actionable guidance before they ever reach the user. A real product never
 * surfaces "Protocol error (Target.createTarget): Target closed".
 *
 * Pure (no imports) so it is trivially unit-testable.
 */

export function humanizeCrawlError(raw: string, phase?: string): string {
  const m = (raw || "").toLowerCase();
  if (/target closed|target\.createtarget|protocol error|session closed|browser has disconnected|out of memory/.test(m)) {
    return "Our scanner's browser ran out of resources before it could finish. Please try again — or lower the speed (fewer pages in parallel) for large sites.";
  }
  if (/timeout|timed out/.test(m)) {
    return "The site took too long to respond. Try again, or scan fewer pages.";
  }
  if (/err_name_not_resolved|enotfound|getaddrinfo/.test(m)) {
    return "We couldn't resolve that domain. Double-check the URL is correct and publicly reachable.";
  }
  if (/err_connection_refused|econnrefused|err_connection/.test(m)) {
    return "The site refused the connection. It may be down or blocking automated access.";
  }
  if (/403|forbidden|blocked automated access|access denied/.test(m)) {
    return "The site blocked our scanner (anti-bot protection). Authenticated scanning or an allowlist may be required.";
  }
  if (/internal addresses|ssrf|private/.test(m)) {
    return "That address can't be scanned (internal or private network). Enter a public URL.";
  }
  if (phase === "auth" || /authentication|login|credentials/.test(m)) {
    return "We couldn't sign in with the provided credentials. Check them and try again.";
  }
  if (/no scannable pages|no pages/.test(m)) {
    return "We couldn't find any pages to scan at that URL. Check the address, or try Deep Crawl for link discovery.";
  }
  return "The audit hit an unexpected error. Please try again — if it keeps happening, try fewer pages.";
}
