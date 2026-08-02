"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { VerticalDefinition } from "@/lib/verticals";
import { burgerVertical } from "@/lib/verticals";

// VerticalDefinition is pure serializable data (labels, flags, seed
// template, tiles — no functions), so it crosses the server->client
// boundary as a plain prop from app/(dashboard)/layout.tsx, which resolves
// it once per request from the entitlements fetch it already makes.
const VerticalContext = createContext<VerticalDefinition | null>(null);

interface VerticalProviderProps {
  vertical: VerticalDefinition;
  children: ReactNode;
}

export function VerticalProvider({ vertical, children }: VerticalProviderProps) {
  return <VerticalContext.Provider value={vertical}>{children}</VerticalContext.Provider>;
}

/**
 * Reads the active VerticalDefinition. Falls back to burgerVertical (never
 * throws) if called outside a VerticalProvider — mirrors this codebase's
 * fail-open philosophy for entitlements-derived state, and keeps this hook
 * safe to use in components rendered in tests or storybook-like isolation.
 */
export function useVertical(): VerticalDefinition {
  const vertical = useContext(VerticalContext);
  return vertical ?? burgerVertical;
}
