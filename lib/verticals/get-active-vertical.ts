/**
 * SERVER-ONLY convenience wrapper around resolveVertical() (lib/verticals/
 * index.ts) for server-side code that doesn't already hold an
 * EntitlementsResult. Transitively calls getEntitlements(), which reads
 * CONTROL_PANEL_API_KEY and must never run in the browser — do not import
 * this from a "use client" file. Kept out of lib/verticals/index.ts so that
 * module stays safe to import from client components.
 *
 * app/(dashboard)/layout.tsx does NOT use this — it already calls
 * getEntitlements() for the billing gate and calls resolveVertical()
 * directly on that result, to avoid a second fetch of the same endpoint.
 * Use getActiveVertical() only where no entitlements result already exists
 * in scope (e.g. a different Server Component, a seed/admin script).
 */

import { getEntitlements } from "@/lib/entitlements";
import { resolveVertical } from "./index";
import type { VerticalDefinition } from "./types";

export async function getActiveVertical(): Promise<VerticalDefinition> {
  const result = await getEntitlements();

  if (result.status !== "known") {
    return resolveVertical(undefined);
  }

  return resolveVertical(result.data.project.category);
}
