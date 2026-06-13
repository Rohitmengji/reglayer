"use client";

/**
 * RegLayer — Recently-viewed tracker
 *
 * Mounted once in Providers. Watches the pathname and records visits to
 * meaningful detail pages so they surface in the command palette's "Recently
 * viewed" group. Uses the page's document.title for the label, falling back to
 * a humanized path. Renders nothing.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { matchTrackedRoute, recordRecent } from "@/lib/recent/recently-viewed";

function humanizeLabel(pathname: string, type: string): string {
  // document.title is usually "<Page> — RegLayer"; take the first segment.
  const title = typeof document !== "undefined" ? document.title : "";
  const cleaned = title.split(/[—|·-]/)[0].trim();
  if (cleaned && cleaned.toLowerCase() !== "reglayer") return cleaned;
  // Fallback: "<Type> <last-path-segment>"
  const id = pathname.split("/").filter(Boolean).pop() ?? "";
  return `${type} ${id.slice(0, 8)}`.trim();
}

export function RecentTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const match = matchTrackedRoute(pathname);
    if (!match) return;
    // Defer a tick so the route's <title> has a chance to update.
    const timer = setTimeout(() => {
      recordRecent({
        href: pathname,
        label: humanizeLabel(pathname, match.type),
        type: match.type,
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [pathname]);

  return null;
}
