/**
 * Client for the control-panel Entitlements API.
 *
 * Contract reference: control-panel/docs/entitlements-api.md
 *
 * This module must only be imported from server-side code (Server Components,
 * Server Actions, Route Handlers) since it reads CONTROL_PANEL_API_KEY, which
 * must never reach the browser.
 */

export interface EntitlementsResponse {
  project: {
    slug: string;
    name: string;
    status: string;
    /**
     * control-panel's `/api/v1/entitlements` route sends this on every
     * response (`app/api/v1/entitlements/route.ts`), sourced from
     * `projects.category`. Consumed by `lib/verticals/index.ts` to resolve
     * which VerticalDefinition this deployment renders — see
     * `resolveVertical()`. Kept optional here (not required) as a defensive
     * measure: an older/misconfigured control-panel deployment, or a key
     * pointing at a project row created before `category` existed, could
     * still omit it. Never treat a missing/unrecognized value as anything
     * other than "unknown vertical" — see resolveVertical()'s fail-open
     * behavior.
     */
    category?: string;
  };
  access: {
    allowed: boolean;
    reason: "ok" | "past_due" | "suspended" | "no_subscription";
  };
  billing: { status: string; current_period_end: string } | null;
  plan: { name: string } | null;
  services: { key: string; name: string; active: boolean }[];
  /** Ascending by `due_date`. */
  payments: {
    amount: number;
    status: "paid" | "pending" | "failed";
    due_date: string;
    paid_at: string | null;
  }[];
}

/**
 * Discriminated union so callers can never confuse "the control-panel told us
 * this account is blocked" with "we don't actually know because the
 * control-panel was unreachable/misconfigured".
 *
 * - `status: "known"` — a real 200 response was parsed. Trust `data.access`.
 * - `status: "unknown"` — network error, non-200/401 status, missing env
 *   vars, or malformed JSON. Callers MUST fail open (render normally) in this
 *   case; never treat "unknown" as "blocked".
 */
export type EntitlementsResult =
  | { status: "known"; data: EntitlementsResponse }
  | { status: "unknown"; reason: string };

export async function getEntitlements(): Promise<EntitlementsResult> {
  const apiUrl = process.env.CONTROL_PANEL_API_URL;
  const apiKey = process.env.CONTROL_PANEL_API_KEY;

  if (!apiUrl || !apiKey) {
    console.error(
      "[entitlements] Missing CONTROL_PANEL_API_URL or CONTROL_PANEL_API_KEY env vars; failing open."
    );
    return { status: "unknown", reason: "missing_env_vars" };
  }

  let res: Response;
  try {
    res = await fetch(`${apiUrl}/api/v1/entitlements`, {
      headers: { "x-api-key": apiKey },
      next: { revalidate: 60 },
    });
  } catch (error) {
    console.error("[entitlements] Network error calling entitlements API; failing open.", error);
    return { status: "unknown", reason: "network_error" };
  }

  if (res.status === 401) {
    console.error("[entitlements] Invalid or revoked control-panel API key; failing open.");
    return { status: "unknown", reason: "unauthorized" };
  }

  if (!res.ok) {
    console.error(
      `[entitlements] Unexpected status ${res.status} from entitlements API; failing open.`
    );
    return { status: "unknown", reason: `http_${res.status}` };
  }

  try {
    const data = (await res.json()) as EntitlementsResponse;
    return { status: "known", data };
  } catch (error) {
    console.error("[entitlements] Malformed JSON from entitlements API; failing open.", error);
    return { status: "unknown", reason: "malformed_json" };
  }
}
