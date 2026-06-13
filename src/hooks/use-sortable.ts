"use client";

/**
 * RegLayer — useSortable
 *
 * Generic client-side sorting for list/table views. Pass the items, an initial
 * sort, and a stable map of accessor functions (one per sortable key). Returns
 * the sorted copy plus the active key/direction and a toggle handler.
 *
 * Keep the `accessors` object referentially stable (define it as a module
 * constant) so sorting only recomputes when items/key/direction change.
 *
 *   const { sorted, sortKey, sortDir, toggleSort } =
 *     useSortable(rows, { key: "createdAt", dir: "desc" }, ACCESSORS);
 */

import { useCallback, useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

export interface SortState {
  key: string;
  dir: SortDir;
}

type Accessor<T> = (item: T) => string | number | null | undefined;

export function useSortable<T>(
  items: T[],
  initial: SortState,
  accessors: Record<string, Accessor<T>>
) {
  const [sortKey, setSortKey] = useState(initial.key);
  const [sortDir, setSortDir] = useState<SortDir>(initial.dir);

  const sorted = useMemo(() => {
    const accessor = accessors[sortKey];
    if (!accessor) return items;
    const copy = [...items];
    copy.sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      // Nulls always sort last regardless of direction.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [items, sortKey, sortDir, accessors]);

  const toggleSort = useCallback(
    (key: string) => {
      setSortKey((prevKey) => {
        if (prevKey === key) {
          setSortDir((d) => (d === "asc" ? "desc" : "asc"));
          return prevKey;
        }
        setSortDir("desc");
        return key;
      });
    },
    []
  );

  return { sorted, sortKey, sortDir, toggleSort };
}
