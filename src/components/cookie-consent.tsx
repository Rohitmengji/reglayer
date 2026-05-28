"use client";

/**
 * ---------------------------------------------------------
 * RegLayer — Cookie Consent Banner
 * ---------------------------------------------------------
 *
 * WHY: GDPR/ePrivacy requires explicit cookie consent in the EU.
 *
 * WHAT:
 * - Shows a bottom banner on first visit
 * - "Accept" and "Decline" buttons
 * - Remembers choice in localStorage
 * - Only shows once per device
 *
 * HOW:
 * - Checks localStorage for "reglayer-cookie-consent" key
 * - If not set, renders banner after mount
 * - Accept: stores "accepted", hides banner
 * - Decline: stores "declined", hides banner
 * - No analytics scripts load until consent is given
 * ---------------------------------------------------------
 */

import { useState, useEffect } from "react";
import { Shield } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

interface ConsentState {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
  timestamp: string | null;
}

const CONSENT_KEY = "reglayer-gdpr-consent";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [consent, setConsent] = useState<ConsentState>({
    essential: true, analytics: false, marketing: false, timestamp: null,
  });

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) {
      setVisible(true);
    } else {
      setConsent(JSON.parse(stored));
    }
  }, []);
  const { t } = useI18n();

  function saveConsent(state: ConsentState) {
    const updated = { ...state, timestamp: new Date().toISOString() };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(updated));
    setConsent(updated);
    setVisible(false);
  }

  function acceptAll() {
    saveConsent({ essential: true, analytics: true, marketing: true, timestamp: null });
  }

  function acceptEssential() {
    saveConsent({ essential: true, analytics: false, marketing: false, timestamp: null });
  }

  function saveCustom() {
    saveConsent(consent);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4">
      <div className="mx-auto max-w-2xl rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <div className="p-5">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-neutral-900 dark:text-white text-sm">
                {t("cookie.title")}
              </h3>
              <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
                {t("cookie.description")}
              </p>

              {showDetails && (
                <div className="mt-4 space-y-3">
                  <label className="flex items-center gap-3 rounded-lg border border-neutral-100 dark:border-neutral-800 p-3">
                    <input type="checkbox" checked disabled className="rounded" />
                    <div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-white">{t("cookie.essential")}</p>
                      <p className="text-xs text-neutral-500">{t("cookie.essentialDesc")}</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 rounded-lg border border-neutral-100 dark:border-neutral-800 p-3 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800">
                    <input
                      type="checkbox"
                      checked={consent.analytics}
                      onChange={(e) => setConsent({ ...consent, analytics: e.target.checked })}
                      className="rounded"
                    />
                    <div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-white">{t("cookie.analytics")}</p>
                      <p className="text-xs text-neutral-500">{t("cookie.analyticsDesc")}</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 rounded-lg border border-neutral-100 dark:border-neutral-800 p-3 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800">
                    <input
                      type="checkbox"
                      checked={consent.marketing}
                      onChange={(e) => setConsent({ ...consent, marketing: e.target.checked })}
                      className="rounded"
                    />
                    <div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-white">{t("cookie.marketing")}</p>
                      <p className="text-xs text-neutral-500">{t("cookie.marketingDesc")}</p>
                    </div>
                  </label>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  onClick={acceptAll}
                  className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 transition-colors"
                >
                  {t("cookie.acceptAll")}
                </button>
                <button
                  onClick={acceptEssential}
                  className="rounded-lg border border-neutral-200 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
                >
                  {t("cookie.essentialOnly")}
                </button>
                {showDetails ? (
                  <button
                    onClick={saveCustom}
                    className="rounded-lg border border-neutral-200 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
                  >
                    {t("cookie.save")}
                  </button>
                ) : (
                  <button
                    onClick={() => setShowDetails(true)}
                    className="text-xs font-medium text-blue-600"
                  >
                    {t("cookie.customize")}
                  </button>
                )}
              </div>

              <p className="mt-3 text-[10px] text-neutral-400">
                {t("cookie.footer")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Hook to check consent status */
export function useConsent(): ConsentState & { hasConsented: boolean } {
  const [state, setState] = useState<ConsentState>({
    essential: true, analytics: false, marketing: false, timestamp: null,
  });

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (stored) setState(JSON.parse(stored));
  }, []);

  return { ...state, hasConsented: !!state.timestamp };
}
