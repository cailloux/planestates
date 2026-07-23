/**
 * MyFlightBook OAuth2 token exchange — PKCE public client.
 *
 * With PKCE there is no client secret: the browser generates a one-time
 * code_verifier and proves possession of it at exchange time. This endpoint
 * exists only as CORS insurance — if MyFlightBook's token endpoint allowed
 * browser calls directly, we wouldn't need it at all. It forwards the
 * exchange verbatim and stores nothing. Plane States holds zero secrets.
 */

export interface OAuthEnv {
  MFB_CLIENT_ID: string;
  MFB_OAUTH_BASE: string;
}

export async function handleTokenExchange(request: Request, env: OAuthEnv): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  if (!env.MFB_CLIENT_ID || env.MFB_CLIENT_ID === "TODO") {
    return json({ error: "not_configured", detail: "MFB_CLIENT_ID not set" }, 503);
  }

  let body: { code?: string; redirectUri?: string; codeVerifier?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  if (!body.code || !body.redirectUri || !body.codeVerifier) {
    return json({ error: "bad_request", detail: "code, redirectUri, codeVerifier required" }, 400);
  }

  const tokenRes = await fetch(`${env.MFB_OAUTH_BASE}/OAuthToken`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: body.code,
      client_id: env.MFB_CLIENT_ID,
      redirect_uri: body.redirectUri,
      code_verifier: body.codeVerifier,
    }),
  });

  const payload = await tokenRes.text();
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
