"use client";

import { createContext, useContext } from "react";

const EmbeddedContext = createContext(false);

export function EmbeddedProvider({ children }: { children: React.ReactNode }) {
  return <EmbeddedContext.Provider value={true}>{children}</EmbeddedContext.Provider>;
}

export function useIsEmbedded() {
  return useContext(EmbeddedContext);
}
