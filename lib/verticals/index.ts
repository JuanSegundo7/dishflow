/**
 * Entry point for resolving "which vertical is this deployment running".
 *
 * PHASE 0 SCAFFOLDING — nothing in the app calls getActiveVertical() yet.
 * This module lays the groundwork so a later phase can wire it into pages
 * without inventing the resolution logic at that point.
 *
 * This module is server-only, same restriction as lib/entitlements.ts (it
 * transitively calls getEntitlements(), which reads CONTROL_PANEL_API_KEY
 * and must never run in the browser).
 */

import { getEntitlements } from "@/lib/entitlements";
import { burgerVertical } from "./burger";
import { isKnownVerticalCategorySlug, VERTICAL_REGISTRY } from "./registry";
import type { VerticalDefinition } from "./types";

export * from "./types";
export { burgerVertical } from "./burger";
export { sushiVertical } from "./sushi";
export { VERTICAL_REGISTRY, isKnownVerticalCategorySlug } from "./registry";

/**
 * Resolve the VerticalDefinition for the current deployment.
 *
 * Reuses lib/entitlements.ts's getEntitlements() — the same server-only
 * fetch already used by middleware.ts/lib/access-check.ts for access
 * gating — instead of inventing a new fetch mechanism. Only
 * `project.category` is consumed here; every other field of the
 * entitlements response is ignored by this function.
 *
 * Fails open to burgerVertical, matching this codebase's existing
 * fail-open philosophy for entitlements-related code (see
 * middleware.ts / lib/access-check.ts, which fail open to "allowed: true"
 * on any unknown entitlements state). This happens whenever the vertical
 * can't be determined:
 *   - getEntitlements() returned `status: "unknown"` (network error,
 *     missing env vars, non-200/401 status, malformed JSON — see
 *     lib/entitlements.ts for the full list), or
 *   - `project.category` is missing (expected today — see the ASSUMPTION
 *     note on EntitlementsResponse.project.category in lib/entitlements.ts;
 *     the real control-panel API doesn't send this field yet), or
 *   - `project.category` is present but not a recognized
 *     VerticalCategorySlug (e.g. a future category the registry doesn't
 *     know about yet).
 *
 * In every fail-open case this returns burgerVertical because burger is the
 * only vertical that actually exists today — there is no neutral/empty
 * VerticalDefinition to fall back to.
 */
export async function getActiveVertical(): Promise<VerticalDefinition> {
  const result = await getEntitlements();

  if (result.status !== "known") {
    return burgerVertical;
  }

  const category = result.data.project.category;

  if (!category || !isKnownVerticalCategorySlug(category)) {
    return burgerVertical;
  }

  return VERTICAL_REGISTRY[category];
}
