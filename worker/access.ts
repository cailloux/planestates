/**
 * Cloudflare Access JWT verification.
 *
 * When a request passes through an Access policy, Cloudflare injects a signed
 * JWT in the Cf-Access-Jwt-Assertion header. Verifying it here means the admin
 * API stays protected even if someone reaches the Worker origin directly with
 * a forged header — the signature check makes the header unforgeable.
 *
 * Config (wrangler.jsonc vars):
 *   ACCESS_TEAM_DOMAIN — e.g. "yourteam.cloudflareaccess.com"
 *   ACCESS_AUD         — the Access application's Audience (AUD) tag
 * Both come from the Zero Trust dashboard when you create the Access app.
 * If either is unset, admin routes fail closed (403).
 */

export interface AccessEnv {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

// Cache Access public keys across requests within this isolate.
let certCache: { keys: Jwk[]; fetchedAt: number } | null = null;
const CERT_TTL_MS = 60 * 60 * 1000;

export async function verifyAccessJwt(request: Request, env: AccessEnv): Promise<{ ok: true; email?: string } | { ok: false; reason: string }> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    return { ok: false, reason: "Access not configured (ACCESS_TEAM_DOMAIN / ACCESS_AUD unset)" };
  }
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return { ok: false, reason: "missing Access token" };

  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed token" };

  let header: { kid?: string; alg?: string };
  let payload: { aud?: string | string[]; iss?: string; exp?: number; email?: string };
  try {
    header = JSON.parse(b64uDecodeText(parts[0]));
    payload = JSON.parse(b64uDecodeText(parts[1]));
  } catch {
    return { ok: false, reason: "undecodable token" };
  }

  if (header.alg !== "RS256") return { ok: false, reason: `unexpected alg ${header.alg}` };

  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) return { ok: false, reason: "audience mismatch" };
  const expectedIss = `https://${env.ACCESS_TEAM_DOMAIN}`;
  if (payload.iss !== expectedIss) return { ok: false, reason: "issuer mismatch" };
  if (!payload.exp || payload.exp * 1000 < Date.now()) return { ok: false, reason: "expired" };

  const jwk = await findKey(env.ACCESS_TEAM_DOMAIN, header.kid);
  if (!jwk) return { ok: false, reason: "signing key not found" };

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64uDecodeBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) return { ok: false, reason: "bad signature" };

  return { ok: true, email: payload.email };
}

async function findKey(teamDomain: string, kid?: string): Promise<Jwk | undefined> {
  const now = Date.now();
  if (!certCache || now - certCache.fetchedAt > CERT_TTL_MS) {
    const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
    if (!res.ok) throw new Error(`Access certs fetch failed: ${res.status}`);
    const body = (await res.json()) as { keys: Jwk[] };
    certCache = { keys: body.keys, fetchedAt: now };
  }
  return certCache.keys.find((k) => k.kid === kid);
}

function b64uDecodeBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64uDecodeText(s: string): string {
  return new TextDecoder().decode(b64uDecodeBytes(s));
}
