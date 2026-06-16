/**
 * RegLayer — Crawl target URL normalization + validation (PURE, testable)
 *
 * Accepts a bare domain ("example.com" → "https://example.com/") but rejects
 * inputs that aren't a real domain. Without this, "google" becomes
 * "https://google/" and the crawl dies with net::ERR_NAME_NOT_RESOLVED — which
 * reads as a broken product. Catch it up front with a human-friendly message.
 */

export function normalizeTargetUrl(raw: string): { url?: string; error?: string } {
  const trimmed = (raw || "").trim();
  if (!trimmed) return { error: "Enter a website address to audit." };
  if (/\s/.test(trimmed)) {
    return { error: "A web address can't contain spaces — try one like https://example.com" };
  }
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { error: "That doesn't look like a valid web address. Try one like example.com" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "Only http:// and https:// addresses can be audited." };
  }
  const host = parsed.hostname.toLowerCase();
  // Require a dotted host ending in a TLD-like label so "google", "localhost",
  // or a trailing-dot host are caught here (rather than dying mid-crawl on DNS).
  const isIPv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  if (!isIPv4 && !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(host)) {
    return { error: `"${trimmed}" isn't a complete domain. Enter the full address, e.g. https://www.example.com` };
  }
  return { url: parsed.toString() };
}
