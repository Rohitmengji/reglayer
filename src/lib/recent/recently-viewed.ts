/**
 * RegLayer — Recently-viewed records (client-only)
 *
 * Tracks the last few meaningful detail pages a user opened (scans, reports,
 * scores, fixes, sites) so they can jump back in from the command palette.
 * Pure localStorage — no backend.
 */

export interface RecentItem {
  href: string;
  label: string;
  type: string;
  viewedAt: number;
}

const STORAGE_KEY = "reglayer-recently-viewed";
const MAX_ITEMS = 8;

/** Route prefixes worth remembering, mapped to a human type label. */
const TRACKED_PREFIXES: { prefix: string; type: string }[] = [
  { prefix: "/scans/", type: "Scan" },
  { prefix: "/report/", type: "Report" },
  { prefix: "/score/", type: "Score" },
  { prefix: "/fix/", type: "Fix" },
  { prefix: "/sites/", type: "Site" },
  { prefix: "/certificate/", type: "Certificate" },
];

export function matchTrackedRoute(pathname: string): { type: string } | null {
  // Skip list index routes like exactly "/scans" — only track detail pages.
  for (const { prefix, type } of TRACKED_PREFIXES) {
    if (pathname.startsWith(prefix) && pathname.length > prefix.length) {
      return { type };
    }
  }
  return null;
}

export function readRecent(): RecentItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordRecent(item: { href: string; label: string; type: string }): void {
  if (typeof window === "undefined") return;
  const existing = readRecent().filter((r) => r.href !== item.href);
  const next: RecentItem[] = [{ ...item, viewedAt: Date.now() }, ...existing].slice(0, MAX_ITEMS);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
