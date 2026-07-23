import type { FlightVisit } from "../../shared/types";

/**
 * MyFlightBook integration — client-side half.
 *
 * The access token is held in sessionStorage only: it survives a page refresh,
 * dies with the tab, and never touches our server except transparently during
 * the token exchange. Flight data is fetched directly from MyFlightBook by the
 * browser (or through a stateless Worker proxy if CORS requires it — see
 * ROADMAP).
 *
 * STATUS: stub. Wire up once MyFlightBook OAuth credentials are issued.
 * Authorize URL construction is real; flight fetching is TODO pending a look
 * at the authenticated API surface.
 */

const TOKEN_KEY = "mfb_token";

export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export function buildAuthorizeUrl(clientId: string, oauthBase: string): string {
  const redirectUri = `${window.location.origin}/oauth/callback`;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "flights:read",
    state: crypto.randomUUID(),
  });
  return `${oauthBase}/Authorize?${params}`;
}

/** Exchange the ?code= from the callback for a token via our Worker. */
export async function exchangeCode(code: string): Promise<string> {
  const res = await fetch("/api/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirectUri: `${window.location.origin}/oauth/callback` }),
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("No access token in response");
  storeToken(data.access_token);
  return data.access_token;
}

export async function fetchFlights(_token: string): Promise<FlightVisit[]> {
  // TODO: call MyFlightBook's authenticated API for the flight list and map
  // route strings into FlightVisit records (any airport in the route counts
  // as visited — see docs/ROADMAP.md for the rationale).
  throw new Error("MyFlightBook flight fetch not implemented yet — use CSV upload for now");
}
