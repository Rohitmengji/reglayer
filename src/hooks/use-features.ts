"use client";

/**
 * RegLayer — useFeatures hook
 *
 * WHY: Sidebar and pages need to know which features the user's workspace has access to.
 * WHAT: Fetches /api/workspace/features on mount, returns enabled feature IDs.
 * HOW: SWR-style caching with useState/useEffect. Master admins get all features.
 */

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

let cachedFeatures: string[] | null = null;

export function useFeatures() {
  const { data: session } = useSession();
  const [features, setFeatures] = useState<string[]>(cachedFeatures || []);
  const [loading, setLoading] = useState(!cachedFeatures);

  useEffect(() => {
    if (!session?.user) return;

    // Master admin sees everything
    if (session.user.isMasterAdmin) {
      const all = ["dashboard", "scans", "violations", "trends", "crawl", "compliance", "analysis", "automation", "manage", "executive", "agency", "settings"];
      setFeatures(all);
      cachedFeatures = all;
      setLoading(false);
      return;
    }

    // Use cache if available
    if (cachedFeatures) {
      setFeatures(cachedFeatures);
      setLoading(false);
      return;
    }

    fetch("/api/workspace/features")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        cachedFeatures = data.features;
        setFeatures(data.features);
      })
      .catch(() => {
        // Fallback: show core features if API fails
        setFeatures(["dashboard", "scans", "settings"]);
      })
      .finally(() => setLoading(false));
  }, [session]);

  const hasFeature = (featureId: string): boolean => {
    // While loading, be permissive to avoid flash
    if (loading) return true;
    return features.includes(featureId);
  };

  return { features, loading, hasFeature };
}

/**
 * Invalidate the cached features (call after plan change or feature toggle).
 */
export function invalidateFeatureCache() {
  cachedFeatures = null;
}
