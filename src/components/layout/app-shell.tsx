"use client";

/**
 * ---------------------------------------------------------
 * RegLayer — App Shell (Authenticated Layout)
 * ---------------------------------------------------------
 *
 * WHY: All authenticated pages share the same layout with
 * sidebar navigation. This component wraps page content.
 *
 * WHAT:
 * - Renders Sidebar (desktop: fixed left, mobile: drawer)
 * - Main content area with proper margins
 * - Mobile hamburger menu toggle
 * - Session check (redirects to login if unauthenticated)
 *
 * HOW:
 * - Desktop: flex layout with fixed w-64 sidebar + flex-1 content
 * - Mobile: sidebar hidden, triggered via hamburger button
 * - Uses useSession() to protect routes client-side
 * - useRouter().push('/auth/login') if no session
 * ---------------------------------------------------------
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { Sidebar } from "./sidebar";
import { Menu, X } from "lucide-react";
import { useIsEmbedded } from "./embedded-context";
import { OnboardingChecklist } from "@/components/onboarding/checklist";
import { useI18n } from "@/components/i18n-provider";

export function AppShell({ children, bare }: { children: React.ReactNode; bare?: boolean }) {
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [workspaceVerified, setWorkspaceVerified] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleWorkspaceCheck = useCallback(() => {
    setWorkspaceVerified(true);
  }, []);

  const handleNoAccess = useCallback(() => {
    router.replace("/request-access");
  }, [router]);

  useEffect(() => {
    if (status === "loading" || workspaceVerified) return;
    if (status === "unauthenticated") {
      signOut({ callbackUrl: "/auth/login" });
      return;
    }

    const isMasterAdmin = session?.user?.isMasterAdmin;
    if (isMasterAdmin) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- master admins bypass workspace check; no async needed
      handleWorkspaceCheck();
      return;
    }

    if (session?.user?.email) {
      // Cancel any in-flight workspace check
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      fetch("/api/team", { signal: controller.signal })
        .then((r) => {
          if (r.status === 401) {
            signOut({ callbackUrl: "/auth/login" });
            return null;
          }
          return r.json();
        })
        .then((data) => {
          if (!data) return;
          if (!data.workspace) {
            handleNoAccess();
          } else {
            handleWorkspaceCheck();
          }
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            // On network failure, allow access (fail open for workspace check)
            handleWorkspaceCheck();
          }
        });
    }

    return () => {
      abortRef.current?.abort();
    };
  }, [session, status, pathname, workspaceVerified, handleWorkspaceCheck, handleNoAccess]);

  // Bare mode: skip shell, just render children (used when embedded in tabbed layouts)
  const isEmbedded = useIsEmbedded();
  if (bare || isEmbedded) {
    return <>{children}</>;
  }

  const showLoading = status === "loading" || (status === "authenticated" && !workspaceVerified);

  if (showLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--background)] dark:bg-neutral-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-neutral-200 border-t-neutral-900 dark:border-neutral-700 dark:border-t-white" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)] dark:bg-neutral-950">
      {/* Skip to content — visible on focus for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-9999 focus:rounded-lg focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          role="presentation"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - hidden on mobile, shown on lg+ */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      <div
        id="mobile-nav-drawer"
        className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-in-out lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal={mobileOpen}
        aria-label={t("a11y.navigation")}
      >
        <Sidebar onNavigate={() => setMobileOpen(false)} />
      </div>

      {/* Main content */}
      <main id="main-content" className="flex-1 flex flex-col overflow-y-auto">
        {/* Mobile header */}
        <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 lg:hidden">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={t("a11y.toggleNavigation")}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-drawer"
            className="rounded-md p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            {mobileOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
          <Image src="/assests/reglayer-logo-light.svg" alt="RegLayer" width={120} height={28} style={{ height: "1.75rem", width: "auto" }} className="dark:hidden" />
          <Image src="/assests/reglayer-logo-dark.svg" alt="RegLayer" width={120} height={28} style={{ height: "1.75rem", width: "auto" }} className="hidden dark:block" />
        </div>

        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 flex-1 w-full flex flex-col">{children}</div>
      </main>

      {/* Onboarding checklist — floating bottom-right */}
      <OnboardingChecklist />
    </div>
  );
}
