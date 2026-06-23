"use client";

/**
 * RegLayer — useFeatures hook
 *
 * Fetches workspace feature set once per mount.
 * Single source of truth for feature access — no optimistic/pessimistic split.
 * Master admins see all features without network call.
 */

import { useState, useEffect, useCallback, useMemo, useReducer } from "react";
import { useSession } from "next-auth/react";
import { FEATURE_CATALOG } from "@/lib/features/feature-catalog";

const ALL_FEATURE_IDS = FEATURE_CATALOG.map((f) => f.id);
const INVALIDATE_EVENT = "reglayer:features-invalidated";

export function useFeatures() {
  const { data: session, status } = useSession();
  const [features, setFeatures] = useState<string[] | null>(null);
  const [refetchKey, bump] = useReducer((x: number) => x + 1, 0);

  // Listen for invalidation events (triggered by workspace switch, plan upgrade, etc.)
  useEffect(() => {
    const handler = () => bump();
    window.addEventListener(INVALIDATE_EVENT, handler);
    return () => window.removeEventListener(INVALIDATE_EVENT, handler);
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) return;

    // Master admin — all features, no network needed
    if (session.user.isMasterAdmin) {
      setFeatures(ALL_FEATURE_IDS);
      return;
    }

    const controller = new AbortController();

    fetch("/api/workspace/features", { signal: controller.signal })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
      .then((data) => {
        if (!controller.signal.aborted) {
          setFeatures(data.features ?? []);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          // Fallback: show minimal features on error
          setFeatures(["dashboard", "scans", "settings"]);
        }
      });

    return () => controller.abort();
  }, [session, status, refetchKey]);

  const loading = features === null;

  const hasFeature = useCallback(
    (featureId: string): boolean => {
      if (loading) return false;
      return features!.includes(featureId);
    },
    [features, loading]
  );

  const resolvedFeatures = useMemo(() => features ?? [], [features]);

  return { features: resolvedFeatures, loading, hasFeature };
}

/**
 * Force re-fetch on next render (call after plan upgrade or feature toggle).
 */
export function invalidateFeatureCache() {
  window.dispatchEvent(new CustomEvent(INVALIDATE_EVENT));
}
