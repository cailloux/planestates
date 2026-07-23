/**
 * MyFlightBook OAuth2 token exchange.
 *
 * This is the only reason Plane States has a backend at all: the authorization-
 * code exchange requires the client secret, which must not ship in browser JS.
 * The Worker exchanges the code and hands the access token straight back to
 * the browser. Nothing is stored server-side — the token lives only in the
 * user's session, and flight data is fetched client-side.
 *
 * Flow (standard authorization code):
 *   1. UI sends the user to {MFB_OAUTH_BASE}/authorize?... (client id, redirect,
 *      scope, state) — built client-side, no secret needed.
 *   2. MyFlightBook redirects back to /oauth/callback?code=...
 *   3. UI POSTs the code to /api/oauth/token (this handler).
 *   4. Handler exchanges code+secret for a token and returns it to the browser.
 */

export interface OAuthEnv {
  MFB_CLIENT_ID: string;
  MFB_CLIENT_SECRET: string; // wrangler secret put MFB_CLIENT_SECRET
  MFB_OAUTH_BASE: string;
}

export async function handleTokenExchange(request: Request, env: OAuthEnv): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  if (!env.MFB_CLIENT_SECRET || env.MFB_CLIENT_ID === "TODO") {
    return json({ error: "not_configured", detail: "MyFlightBook credentials not set" }, 503);
  }

  let body: { code?: string; redirectUri?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  if (!body.code || !body.redirectUri) {
    return json({ error: "bad_request", detail: "code and redirectUri required" }, 400);
  }

  const tokenRes = await fetch(`${env.MFB_OAUTH_BASE}/OAuthToken`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: body.code,
      client_id: env.MFB_CLIENT_ID,
      client_secret: env.MFB_CLIENT_SECRET,
      redirect_uri: body.redirectUri,
    }),
  });

  const payload = await tokenRes.text();
  // Pass MyFlightBook's response through verbatim (token or error) — we don't
  // inspect or retain it.
  return new Response(payload, {
    status: tokenRes.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
