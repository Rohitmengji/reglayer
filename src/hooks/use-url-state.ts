"use client";

/**
 * RegLayer — useUrlState
 *
 * A drop-in, signature-compatible replacement for useState<string> that backs
 * the value with a URL query parameter. Makes filters/tabs shareable and
 * survive reloads + the browser back button.
 *
 * Supports both direct values and updater functions, matching useState:
 *   const [status, setStatus] = useUrlState("status", "ALL");
 *   setStatus("OPEN");
 *   setStatus((prev) => prev === "OPEN" ? "ALL" : "OPEN");
 *
 * The default value is omitted from the URL (kept clean). Uses router.replace
 * with scroll:false so updating a filter does not push history or jump the page.
 */

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function useUrlState<T extends string>(
  key: string,
  defaultValue: T
): [T, (next: T | ((prev: T) => T)) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const value = (searchParams.get(key) as T | null) ?? defaultValue;

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const current = (searchParams.get(key) as T | null) ?? defaultValue;
      const resolved = typeof next === "function" ? (next as (p: T) => T)(current) : next;

      const params = new URLSearchParams(searchParams.toString());
      if (resolved === defaultValue || resolved === "") {
        params.delete(key);
      } else {
        params.set(key, resolved);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [key, defaultValue, pathname, router, searchParams]
  );

  return [value, setValue];
}
