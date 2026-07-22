/**
 * Small reusable wrapper around `getEntitlements()` that collapses the
 * discriminated union down to a plain allow/deny verdict.
 *
 * Fails open: an "unknown" entitlements result (network error, missing env
 * vars, control-panel down) is always treated as `allowed: true` and
 * `activeServiceKeys: null` (no gating info) so an unrelated ops/network
 * problem never locks out a real user or hides a feature they rely on.
 * Callers that need the full entitlements payload (billing, plan, services,
 * payments) should keep calling `getEntitlements()` directly — this helper
 * is only for the "can this account use the app / this feature at all"
 * decision, shared by middleware and any future caller.
 *
 * `middleware.ts` caches this verdict (including `activeServiceKeys`) in the
 * signed, short-lived `cp_access` cookie purely as a latency optimization.
 * That cookie is NOT a general-purpose source of truth — any Route Handler
 * (`app/api/**\/route.ts`) that needs an access/entitlements decision MUST
 * call `getAccessVerdict()` or `getEntitlements()` directly instead of
 * reading the cookie, since middleware redirects don't protect API route
 * logic the way they protect page navigation.
 */

import { getEntitlements } from "./entitlements";

export interface AccessVerdict {
  allowed: boolean;
  reason: string;
  /** Active service keys for per-service route gating; `null` = no gating info (fail-open). */
  activeServiceKeys: string[] | null;
}

export async function getAccessVerdict(): Promise<AccessVerdict> {
  const entitlements = await getEntitlements();

  if (entitlements.status === "unknown") {
    return { allowed: true, reason: "unknown", activeServiceKeys: null };
  }

  return {
    allowed: entitlements.data.access.allowed,
    reason: entitlements.data.access.reason,
    activeServiceKeys: entitlements.data.services
      .filter((service) => service.active)
      .map((service) => service.key),
  };
}
