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

import { useState, useEffect, useCallback, useRef, useContext } from "react";
import { useSession } from "next-auth/react";
import { clearLocalWorkspaceState, signOutAndClear } from "@/lib/auth/sign-out";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { Sidebar } from "./sidebar";
import { Menu, X, MessageSquare } from "lucide-react";
import { useIsEmbedded } from "./embedded-context";
import { ChatPanel } from "@/components/ai/ChatPanel";
import { useChatStore } from "@/stores/chatStore";
import { useI18n } from "@/components/i18n-provider";
import { OfflineBanner } from "@/components/ui/offline-banner";
import { SessionTimeoutWarning } from "@/components/ui/session-timeout-warning";
import { KeyboardShortcutSheet } from "@/components/ui/keyboard-shortcut-sheet";
import { useAppTabSync } from "@/hooks/use-tab-sync";
import { ViewingPreferencesTarget } from "@/components/a11y/viewing-preferences";
import { PageError } from "@/components/ui/page-error";

export function AppShell({ children, bare }: { children: React.ReactNode; bare?: boolean }) {
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const chatOpen = useChatStore((s) => s.panelOpen);
  const setChatOpen = useChatStore((s) => s.setPanelOpen);
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [workspaceVerified, setWorkspaceVerified] = useState(false);
  const [workspaceCheckFailed, setWorkspaceCheckFailed] = useState(false);
  const [workspaceCheckAttempt, setWorkspaceCheckAttempt] = useState(0);
  const mobileDrawerRef = useRef<HTMLDivElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const setPreferencesTarget = useContext(ViewingPreferencesTarget);

  // Cross-tab synchronization — keeps workspace context, auth, and scan events in sync
  useAppTabSync({
    onWorkspaceChanged: () => {
      clearLocalWorkspaceState();
      window.location.assign("/dashboard");
    },
    onSessionExpired: () => {
      signOutAndClear({ callbackUrl: "/auth/login" });
    },
  });

  const handleWorkspaceCheck = useCallback(() => {
    setWorkspaceVerified(true);
  }, []);

  const handleNoAccess = useCallback(() => {
    router.replace("/request-access");
  }, [router]);

  useEffect(() => {
    if (status === "loading" || workspaceVerified) return;
    let disposed = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (status === "unauthenticated") {
      signOutAndClear({ callbackUrl: "/auth/login" });
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
      timeout = setTimeout(() => controller.abort(), 15_000);

      fetch("/api/team", { signal: controller.signal })
        .then((r) => {
          if (r.status === 401) {
            signOutAndClear({ callbackUrl: "/auth/login" });
            return null;
          }
          if (!r.ok) throw new Error("Workspace check unavailable");
          return r.json();
        })
        .then((data) => {
          if (!data || disposed) return;
          if (!data.workspace) {
            handleNoAccess();
          } else {
            handleWorkspaceCheck();
          }
        })
        .catch(() => { if (!disposed) setWorkspaceCheckFailed(true); })
        .finally(() => clearTimeout(timeout));
    }

    return () => {
      disposed = true;
      clearTimeout(timeout);
      abortRef.current?.abort();
    };
  }, [session, status, pathname, workspaceVerified, workspaceCheckAttempt, handleWorkspaceCheck, handleNoAccess]);

  // Focus trap + keyboard escape for mobile drawer (WCAG 2.4.3 Focus Order)
  // Must be before any conditional returns to respect Rules of Hooks.
  useEffect(() => {
    if (!mobileOpen) return;
    const drawer = mobileDrawerRef.current;
    if (!drawer) return;
    const toggle = mobileToggleRef.current;

    // Focus the drawer on open
    const firstFocusable = drawer.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMobileOpen(false);
        return;
      }
      // Trap focus inside drawer
      if (e.key === "Tab" && drawer) {
        const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )).filter((element) => element.getClientRects().length > 0 && !element.closest("[inert]"));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      document.removeEventListener("keydown", handleKeyDown);
      if (toggle?.getClientRects().length) {
        toggle.focus();
      } else {
        document.getElementById("main-content")?.focus();
      }
    };
  }, [mobileOpen]);

  // Bare mode: skip shell, just render children (used when embedded in tabbed layouts)
  const isEmbedded = useIsEmbedded();
  if (bare || isEmbedded) {
    return <>{children}</>;
  }

  const showLoading = status === "loading" || (status === "authenticated" && !workspaceVerified);

  if (workspaceCheckFailed && !workspaceVerified) {
    return <main className="mx-auto max-w-xl p-6"><PageError
      title="Workspace access could not be checked"
      message="Your session is still active. Wait a moment, then try again."
      onRetry={() => { setWorkspaceCheckFailed(false); setWorkspaceCheckAttempt(value => value + 1); }}
    /></main>;
  }

  if (showLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background dark:bg-neutral-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-neutral-200 border-t-neutral-900 dark:border-neutral-700 dark:border-t-white" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background dark:bg-neutral-950">
      {/* Skip to content — visible on focus for keyboard users */}
      <a
        href="#main-content"
        inert={mobileOpen}
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
      <div className="hidden lg:flex" inert={mobileOpen}>
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      <div
        ref={mobileDrawerRef}
        id="mobile-nav-drawer"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-neutral-50 dark:bg-neutral-900 transform transition-transform duration-200 ease-in-out motion-reduce:transition-none lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        inert={!mobileOpen}
        aria-hidden={!mobileOpen}
        role={mobileOpen ? "dialog" : undefined}
        aria-modal={mobileOpen}
        aria-label={t("a11y.navigation")}
      >
        <div className="flex h-12 shrink-0 items-center justify-end px-2">
          <button
            type="button"
            aria-label={t("a11y.close")}
            onClick={() => setMobileOpen(false)}
            className="flex h-11 w-11 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </div>
      </div>

      {/* Main content */}
      <main id="main-content" tabIndex={-1} inert={mobileOpen} className="min-w-0 flex-1 flex flex-col overflow-y-auto">
        {/* Connectivity & session warnings */}
        <OfflineBanner />
        <SessionTimeoutWarning />

        {/* Mobile header */}
        <div className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 lg:contents">
          <div className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
          <button
            ref={mobileToggleRef}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={t("a11y.toggleNavigation")}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-drawer"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            {mobileOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
          <Image src="/assests/reglayer-logo-light.svg" alt="RegLayer" width={120} height={28} priority style={{ height: "auto", width: "auto" }} className="h-7 w-auto max-w-30 dark:hidden" />
          <Image src="/assests/reglayer-logo-dark.svg" alt="RegLayer" width={120} height={28} priority style={{ height: "auto", width: "auto" }} className="h-7 w-auto max-w-30 hidden dark:block" />
          </div>
          <button
            onClick={() => setChatOpen(true)}
            className={`ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-colors hover:bg-accent/90 lg:fixed lg:bottom-6 lg:right-6 lg:z-40 ${chatOpen ? "invisible" : ""}`}
            aria-label="Open AI Chat"
            title="Ask RegLayer AI"
          >
            <MessageSquare className="h-5 w-5" aria-hidden="true" />
          </button>
          <div ref={setPreferencesTarget} className="relative h-11 w-11 shrink-0 lg:fixed lg:bottom-20 lg:right-6 lg:z-9998" />
        </div>

        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 flex-1 w-full flex flex-col">{children}</div>
      </main>

      <div className="contents" inert={mobileOpen}>

      {/* AI Chat panel — slides in from right */}
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />

      {/* Keyboard shortcut sheet — press ? to toggle */}
      <KeyboardShortcutSheet />
      </div>
    </div>
  );
}
