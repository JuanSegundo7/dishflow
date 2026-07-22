import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getAccessVerdict, type AccessVerdict } from "@/lib/access-check"
import { signPayload, verifyAndParse } from "@/lib/signed-cookie"
import { SERVICE_NAV_HREFS } from "@/lib/service-nav-map"

// Short-lived cache of the control-panel access verdict so middleware
// doesn't call the entitlements API on every single request. `next: {
// revalidate: 60 }` (used by getEntitlements' fetch) is a route-handler/RSC
// concept and is NOT honored by the edge middleware runtime, hence this
// cookie-based cache. It is a UX/latency optimization ONLY, and it is now
// HMAC-signed (see lib/signed-cookie.ts) so it can't be forged by a raw
// HTTP request setting an arbitrary `Cookie:` header — but it is still only
// meant to be read by this file. app/(dashboard)/layout.tsx still calls
// getEntitlements() fresh on every dashboard render as the authoritative
// gate. Any future Route Handler (app/api/**/route.ts) that needs an
// access/entitlements decision MUST call getAccessVerdict()/getEntitlements()
// directly instead of parsing this cookie — middleware redirects don't
// protect API route logic the same way they protect page navigation.
const ACCESS_COOKIE_NAME = "cp_access"
const ACCESS_COOKIE_TTL_MS = 60_000
const COOKIE_SIGNING_SECRET = process.env.COOKIE_SIGNING_SECRET

interface AccessCookiePayload extends AccessVerdict {
  expiresAt: number
}

// "/plan" must never be gated by per-service route enforcement below — it's
// how a blocked/limited account manages their situation. Guard against a
// future SERVICE_NAV_HREFS edit accidentally including it.
const NEVER_GATED_PATHS = ["/login", "/suspended", "/plan"]

function isPathGatedByInactiveService(pathname: string, activeServiceKeys: string[]): boolean {
  if (NEVER_GATED_PATHS.includes(pathname)) return false

  return Object.entries(SERVICE_NAV_HREFS).some(([serviceKey, hrefs]) => {
    if (activeServiceKeys.includes(serviceKey)) return false

    return hrefs.some((href) => {
      if (href === "/") return pathname === "/"
      return pathname === href || pathname.startsWith(href + "/")
    })
  })
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url))
  }

  // Layer 2: account-level access gate (past_due/suspended/no_subscription).
  // Runs on every authenticated route (including deep-links) except /login
  // and /suspended, which must stay reachable no matter the account state.
  // Fails open on "unknown" control-panel state — see getAccessVerdict().
  const isExemptRoute = pathname === "/login" || pathname === "/suspended"

  if (user && !isExemptRoute) {
    const verdict = await getCachedAccessVerdict(request, supabaseResponse)

    if (!verdict.allowed) {
      return NextResponse.redirect(new URL("/suspended", request.url))
    }

    // Layer 3: per-service route gate. The account itself is fine (layer 2
    // passed above) but this specific feature/service is off — redirect to
    // /plan, not /suspended. `activeServiceKeys: null` means "unknown"
    // control-panel state, which fails open (no gating at all).
    if (
      verdict.activeServiceKeys !== null &&
      isPathGatedByInactiveService(pathname, verdict.activeServiceKeys)
    ) {
      return NextResponse.redirect(new URL("/plan", request.url))
    }
  }

  if (user && pathname === "/suspended") {
    const verdict = await getCachedAccessVerdict(request, supabaseResponse)

    if (verdict.allowed) {
      return NextResponse.redirect(new URL("/", request.url))
    }
  }

  return supabaseResponse
}

async function getCachedAccessVerdict(
  request: NextRequest,
  response: NextResponse
): Promise<AccessVerdict> {
  const cached = request.cookies.get(ACCESS_COOKIE_NAME)?.value

  if (cached) {
    const payload = await verifyAndParse<AccessCookiePayload>(cached, COOKIE_SIGNING_SECRET ?? "")
    if (payload && payload.expiresAt > Date.now()) {
      return {
        allowed: payload.allowed,
        reason: payload.reason,
        activeServiceKeys: payload.activeServiceKeys,
      }
    }
    // Missing secret, tampered/malformed cookie, or expired — fall through
    // and re-fetch below. Never trust an unverifiable cookie.
  }

  const verdict = await getAccessVerdict()

  const payload: AccessCookiePayload = {
    ...verdict,
    expiresAt: Date.now() + ACCESS_COOKIE_TTL_MS,
  }

  const signed = await signPayload(payload, COOKIE_SIGNING_SECRET ?? "")

  if (signed === null) {
    // No COOKIE_SIGNING_SECRET configured: don't cache an unsigned/forgeable
    // cookie. Every request re-fetches live instead — slower, but safe and
    // consistent with this codebase's fail-open philosophy.
    console.warn(
      "[middleware] COOKIE_SIGNING_SECRET is not set; skipping cp_access cache (every request will re-fetch entitlements live)."
    )
    return verdict
  }

  response.cookies.set(ACCESS_COOKIE_NAME, signed, {
    maxAge: ACCESS_COOKIE_TTL_MS / 1000,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  })

  return verdict
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:jpg|jpeg|png|svg|webp|ico)).*)",
  ],
}
