/**
 * RegLayer — Upgrade Prompt Utility
 *
 * WHY: When users hit plan limits, they need a friendly nudge to upgrade.
 * WHAT: Shows a persistent toast notification with upgrade guidance when API returns upgradeRequired.
 * HOW: Called from client-side fetch error handlers. Uses Sonner toast library for UI.
 */
import { toast } from "sonner";

/**
 * Handles API error responses that include upgradeRequired flag.
 * Shows a persistent toast with upgrade guidance.
 * Returns true if an upgrade prompt was shown, false otherwise.
 */
export function handleUpgradeResponse(data: { error?: string; upgradeRequired?: boolean }): boolean {
  if (!data?.upgradeRequired) return false;

  toast.error(data.error || "Plan limit reached", {
    description: "Visit Settings → Plan & Usage to view your current limits.",
    duration: 8000,
    action: {
      label: "View Plan",
      onClick: () => {
        window.location.href = "/settings";
      },
    },
  });

  return true;
}
