/**
 * Entry point for resolving "which vertical is this deployment running".
 *
 * This module is intentionally free of any server-only import (no
 * lib/entitlements.ts here) so it's safe to import from "use client"
 * components — every page that needs vertical labels is a client
 * component. `resolveVertical()` is the pure, synchronous core: it takes a
 * category string (or undefined) and returns a VerticalDefinition, no I/O.
 *
 * app/(dashboard)/layout.tsx already calls getEntitlements() once per
 * request for the billing gate; it calls resolveVertical() directly on
 * that result and hands the VerticalDefinition down via VerticalProvider
 * (components/providers/vertical-provider.tsx) so client pages read it via
 * useVertical() instead of each re-fetching entitlements just for
 * `category`.
 *
 * For server-side code that wants the vertical without already holding an
 * entitlements result, see getActiveVertical() in
 * lib/verticals/get-active-vertical.ts — kept in its own file, not
 * re-exported here, specifically so importing from this module never pulls
 * in the server-only entitlements fetch.
 */

import { burgerVertical } from "./burger";
import { isKnownVerticalCategorySlug, VERTICAL_REGISTRY } from "./registry";
import type { VerticalDefinition } from "./types";

export * from "./types";
export { burgerVertical } from "./burger";
export { sushiVertical } from "./sushi";
export { VERTICAL_REGISTRY, isKnownVerticalCategorySlug } from "./registry";

/**
 * Resolve the VerticalDefinition for a given `projects.category` value.
 *
 * Fails open to burgerVertical, matching this codebase's existing
 * fail-open philosophy for entitlements-related code (see
 * middleware.ts / lib/access-check.ts, which fail open to "allowed: true"
 * on any unknown entitlements state). This happens whenever the vertical
 * can't be determined:
 *   - `category` is undefined (entitlements were "unknown" — network
 *     error, missing env vars, non-200/401 status, malformed JSON — or the
 *     control-panel project row predates the `category` column), or
 *   - `category` is present but not a recognized VerticalCategorySlug
 *     (e.g. a future category the registry doesn't know about yet).
 *
 * In every fail-open case this returns burgerVertical because burger is the
 * only vertical that actually exists today — there is no neutral/empty
 * VerticalDefinition to fall back to.
 */
export function resolveVertical(category: string | undefined): VerticalDefinition {
  if (!category || !isKnownVerticalCategorySlug(category)) {
    return burgerVertical;
  }

  return VERTICAL_REGISTRY[category];
}
