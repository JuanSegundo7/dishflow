/**
 * HMAC-signed cookie payload helpers, built on Web Crypto (`crypto.subtle`)
 * only — no Node `crypto` module, no `Buffer`. This is what lets the same
 * code run in both the Edge middleware runtime and Node.
 *
 * Used by middleware.ts to protect the `cp_access` cache cookie from being
 * forged by a raw HTTP request (curl, a script, etc.) setting an arbitrary
 * `Cookie:` header. See the comment in middleware.ts for the full threat
 * model and why this cookie is a latency optimization, not a source of truth.
 */

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function hmacSign(payloadBytes: Uint8Array, secret: string): Promise<Uint8Array> {
  const key = await importHmacKey(secret);
  // Cast needed because @types/node's generic Uint8Array<ArrayBufferLike>
  // isn't structurally assignable to lib.dom's BufferSource in this
  // TS/@types/node combo, even though this is always a plain
  // ArrayBuffer-backed Uint8Array at runtime.
  const signature = await crypto.subtle.sign("HMAC", key, payloadBytes as BufferSource);
  return new Uint8Array(signature);
}

/**
 * Signs `payload` and returns `"<payload_b64url>.<signature_b64url>"`.
 * Returns `null` when `secret` is empty/undefined — caller must skip caching
 * in that case rather than crash (fail-open, same convention as the rest of
 * this codebase's entitlements handling).
 */
export async function signPayload(payload: unknown, secret: string): Promise<string | null> {
  if (!secret) return null

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload))
  const signatureBytes = await hmacSign(payloadBytes, secret)

  return `${toBase64Url(payloadBytes)}.${toBase64Url(signatureBytes)}`
}

/**
 * Verifies `cookieValue` against `secret` and returns the parsed payload, or
 * `null` on ANY failure (missing secret, malformed cookie, signature
 * mismatch, JSON parse error) — never throws.
 */
export async function verifyAndParse<T>(cookieValue: string, secret: string): Promise<T | null> {
  if (!secret) return null

  const lastDot = cookieValue.lastIndexOf(".")
  if (lastDot === -1) return null

  const payloadB64 = cookieValue.slice(0, lastDot)
  const signatureB64 = cookieValue.slice(lastDot + 1)

  try {
    const payloadBytes = fromBase64Url(payloadB64)
    const expectedSignatureBytes = await hmacSign(payloadBytes, secret)
    // Plain string comparison, not constant-time: this cookie only gates a
    // middleware redirect (see middleware.ts), not a secret like a password
    // hash, so timing side-channels aren't a meaningful concern here.
    const expectedSignatureB64 = toBase64Url(expectedSignatureBytes)
    if (expectedSignatureB64 !== signatureB64) return null

    const json = new TextDecoder().decode(payloadBytes)
    return JSON.parse(json) as T
  } catch {
    return null
  }
}
