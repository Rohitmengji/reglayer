/**
 * SSRF protection — blocks scan/crawl requests to internal/private networks.
 *
 * Prevents attackers from using the scanner to probe:
 * - AWS/cloud metadata (169.254.169.254 and link-local)
 * - Internal services (localhost, 127.x, 10.x, 172.16-31.x, 192.168.x, CGNAT)
 * - IPv6 loopback/link-local/ULA — including BRACKETED forms (http://[::1]/),
 *   IPv4-mapped (::ffff:127.0.0.1), and fully-expanded loopback
 * - Hostnames that RESOLVE to any of the above (resolvesToInternalIp)
 *
 * Note: Node's WHATWG URL parser already canonicalizes decimal/hex/octal IPv4
 * (e.g. http://2130706433 → 127.0.0.1), so those encodings are caught by the
 * dotted-IPv4 checks below. The bracketed-IPv6 forms are NOT canonicalized away,
 * which is why they are handled explicitly here.
 */

import { lookup } from "node:dns/promises";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "ip6-localhost",
  "ip6-loopback",
]);

const BLOCKED_PORTS = new Set([
  6379,  // redis
  5432,  // postgres
  3306,  // mysql
  27017, // mongodb
  11211, // memcached
  9200,  // elasticsearch
  2379,  // etcd
  5984,  // couchdb
]);

function isPrivateIPv4(ip: string): boolean {
  return (
    /^127\./.test(ip) ||                     // loopback
    /^10\./.test(ip) ||                      // class A private
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || // class B private
    /^192\.168\./.test(ip) ||                // class C private
    /^169\.254\./.test(ip) ||                // link-local (cloud metadata)
    /^0\./.test(ip) ||                       // "this" network
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip) // CGNAT 100.64.0.0/10
  );
}

/**
 * Expand an IPv6 literal to its 8 hextets (numbers), or null if unparseable.
 * Handles "::" compression and a trailing embedded IPv4 (dotted) group.
 */
function parseIPv6(input: string): number[] | null {
  let h = input.split("%")[0]; // drop zone id
  if (!h.includes(":")) return null;
  // Convert a trailing dotted IPv4 (e.g. ::ffff:127.0.0.1) into two hextets.
  const v4 = h.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4) {
    const p = v4[1].split(".").map(Number);
    if (p.some((n) => n > 255)) return null;
    const hex = `${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
    h = h.slice(0, v4.index) + hex;
  }
  const sides = h.split("::");
  if (sides.length > 2) return null;
  const head = sides[0] ? sides[0].split(":") : [];
  const tail = sides.length === 2 && sides[1] ? sides[1].split(":") : [];
  let groups: string[];
  if (sides.length === 1) {
    groups = head;
  } else {
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill("0"), ...tail];
  }
  if (groups.length !== 8) return null;
  const nums = groups.map((g) => (g === "" ? 0 : parseInt(g, 16)));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) return null;
  return nums;
}

/** Check an IPv6 literal (brackets already stripped, lower-cased). */
function isPrivateIPv6(h: string): boolean {
  const g = parseIPv6(h);
  if (!g) {
    // Conservative fallback for anything we couldn't parse.
    return h === "::1" || h === "::" || /^fe80:/.test(h) || /^f[cd]/.test(h);
  }
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1 loopback
  if (g.every((x) => x === 0)) return true;                            // :: unspecified
  if ((g[0] & 0xffc0) === 0xfe80) return true;                         // fe80::/10 link-local
  if ((g[0] & 0xfe00) === 0xfc00) return true;                         // fc00::/7 ULA
  // IPv4-mapped (::ffff:a.b.c.d) or IPv4-compatible (::a.b.c.d) → check embedded v4
  const mapped = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff;
  const compat = g.slice(0, 6).every((x) => x === 0) && (g[6] !== 0 || g[7] !== 0);
  if (mapped || compat) {
    const v4 = `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;
    return isPrivateIPv4(v4);
  }
  return false;
}

/** Normalize a URL hostname for checking (lower-case, strip IPv6 brackets). */
function normalizeHost(parsed: URL): string {
  let host = parsed.hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  return host;
}

/**
 * Validate that a URL is safe to scan (not internal/private). Synchronous —
 * catches literal IPs (any encoding the URL parser canonicalizes) and the
 * blocked-hostname list. Returns an error message if blocked, null if safe.
 */
export function validateScanUrl(urlString: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return "Invalid URL format";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Only HTTP and HTTPS URLs are allowed";
  }

  const host = normalizeHost(parsed);
  if (!host) return "Invalid URL format";
  if (BLOCKED_HOSTNAMES.has(host)) {
    return "Scanning internal addresses is not allowed";
  }
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) {
    return "Scanning private/internal IP addresses is not allowed";
  }

  const port = parsed.port ? parseInt(parsed.port) : null;
  if (port && BLOCKED_PORTS.has(port)) {
    return "Scanning internal service ports is not allowed";
  }

  return null; // Safe
}

/**
 * Defense-in-depth: resolve a hostname and block if ANY resolved address is
 * private/internal. Catches public hostnames that point at internal IPs (DNS
 * misconfig / rebinding-at-rest) which the literal checks above can't see.
 *
 * Fail-OPEN on DNS error/timeout (a transient DNS hiccup must not block a
 * legitimate public site — the crawl will simply fail later if the host is bad).
 * Literal IPs are already handled by validateScanUrl, so we skip them here.
 */
export async function resolvesToInternalIp(urlString: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return false;
  }
  const host = normalizeHost(parsed);
  // Skip literal IPs (handled synchronously) and obviously-empty hosts.
  if (!host || /^[\d.]+$/.test(host) || host.includes(":")) return false;

  try {
    const addrs = await Promise.race([
      lookup(host, { all: true }),
      new Promise<Array<{ address: string; family: number }>>((_, reject) =>
        setTimeout(() => reject(new Error("dns-timeout")), 2500),
      ),
    ]);
    for (const a of addrs) {
      const addr = a.address.toLowerCase();
      if (a.family === 4 && isPrivateIPv4(addr)) return true;
      if (a.family === 6 && isPrivateIPv6(addr.replace(/^\[|\]$/g, ""))) return true;
    }
  } catch {
    // DNS failure/timeout → fail open (don't block legit sites on a hiccup).
  }
  return false;
}
