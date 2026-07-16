"use client";

/**
 * Hook to fetch and cache AI credit balance.
 *
 * WHY (DEF-095): Users need to see remaining credits before triggering
 *   AI actions so they can make informed decisions about spending.
 * WHAT: Fetches /api/credits, caches for 60s, re-fetches after AI actions.
 * HOW: SWR-like pattern with useState + useEffect + manual refetch.
 */

import { useState, useEffect, useCallback, useRef } from "react";

interface CreditInfo {
  used: number;
  limit: number;
  remaining: number;
  unlimited: boolean;
}

const CACHE_TTL_MS = 60_000; // 60s

let cachedCredits: CreditInfo | null = null;
let cachedAt = 0;

export function useCredits() {
  const [credits, setCredits] = useState<CreditInfo | null>(cachedCredits);
  const fetchingRef = useRef(false);

  const fetchCredits = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const res = await fetch("/api/credits");
      if (!res.ok) return;
      const data = await res.json();
      const info: CreditInfo = {
        used: data.credits?.used ?? 0,
        limit: data.credits?.limit ?? 0,
        remaining: data.credits?.remaining ?? 0,
        unlimited: data.credits?.unlimited ?? false,
      };
      cachedCredits = info;
      cachedAt = Date.now();
      setCredits(info);
    } catch {
      // Silently fail — credits indicator is non-critical
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (cachedCredits && Date.now() - cachedAt < CACHE_TTL_MS) {
      setCredits(cachedCredits);
      return;
    }
    fetchCredits();
  }, [fetchCredits]);

  return { credits, refetch: fetchCredits };
}
