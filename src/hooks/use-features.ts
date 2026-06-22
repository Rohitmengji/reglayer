"use client";

/**
 * RegLayer — useFeatures hook
 *
 * Fetches workspace feature set once per session.
 * Uses useRef for cache (safe in concurrent mode, per-component instance).
 * Master admins see all features without network call.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { FEATURE_CATALOG } from "@/lib/features/feature-catalog";

const ALL_FEATURE_IDS = FEATURE_CATALOG.map((f) => f.id);

export function useFeatures() {
  const { data: session, status } = useSession();
  const [features, setFeatures] = useState<string[] | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    // Master admin — no network needed
    if (session.user.isMasterAdmin) {
      Promise.resolve().then(() => setFeatures(ALL_FEATURE_IDS));
      return;
    }

    const controller = new AbortController();

    fetch("/api/workspace/features", { signal: controller.signal })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
      .then((data) => setFeatures(data.features ?? []))
      .catch((err) => {
        if (err.name !== "AbortError") {
          setFeatures(["dashboard", "scans", "settings"]);
        }
      });

    return () => controller.abort();
  }, [session, status]);

  // Derive loading from whether features have resolved
  const loading = features === null;

  const hasFeature = useCallback(
    (featureId: string): boolean => {
      if (loading) return false; // Don't show gated features until we know the plan
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
  window.dispatchEvent(new CustomEvent("reglayer:features-invalidated"));
}
