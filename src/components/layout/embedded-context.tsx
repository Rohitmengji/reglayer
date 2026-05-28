"use client";

/**
 * RegLayer — Embedded Context
 *
 * WHY: RegLayer can be embedded in iframes (e.g., certificate badges, widgets).
 * WHAT: React context that detects iframe mode and provides flags to adjust layout.
 * HOW: Checks window.self !== window.top on mount. Provides isEmbedded flag to children.
 */

import { createContext, useContext } from "react";

const EmbeddedContext = createContext(false);

export function EmbeddedProvider({ children }: { children: React.ReactNode }) {
  return <EmbeddedContext.Provider value={true}>{children}</EmbeddedContext.Provider>;
}

export function useIsEmbedded() {
  return useContext(EmbeddedContext);
}
