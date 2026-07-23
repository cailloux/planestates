import type { FlightVisit } from "../../shared/types";

/**
 * MyFlightBook integration — PKCE public client, browser side.
 *
 * No client secret exists anywhere. The browser generates a random
 * code_verifier, sends its SHA-256 (code_challenge) with the authorize
 * redirect, and proves the verifier at token exchange. The exchange goes
 * through our Worker only to sidestep CORS; the Worker adds nothing and
 * stores nothing. Token lives in sessionStorage (dies with the tab).
 *
 * Scope: "visited" — MyFlightBook computes visited airports server-side, so
 * Plane States never sees flights, dates, aircraft, or hours.
 * VERIFY in the MFB testbed (PlayPen → ClientTestBed): exact scope token and
 * the VisitedAirports call shape below.
 */

const TOKEN_KEY = "mfb_token";
const VERIFIER_KEY = "mfb_pkce_verifier";
const STATE_KEY = "mfb_oauth_state";

export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

/** Build the authorize URL and stash the PKCE verifier + state for callback. */
export async function beginAuth(clientId: string, oauthBase: string): Promise<string> {
  const verifier = b64u(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64u(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
  );
  const state = crypto.randomUUID();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri(),
    scope: "visited",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${oauthBase}/AuthorizePKCE?${params}`;
}

/** Handle /oauth/callback: validate state, exchange code via the Worker. */
export async function completeAuth(query: URLSearchParams): Promise<string> {
  const code = query.get("code");
  const state = query.get("state");
  if (!code) throw new Error(query.get("error_description") ?? "Authorization was denied");
  if (state !== sessionStorage.getItem(STATE_KEY)) throw new Error("State mismatch — please retry sign-in");
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error("Missing PKCE verifier — please retry sign-in");

  const res = await fetch("/api/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirectUri: redirectUri(), codeVerifier: verifier }),
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("No access token in response");

  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.setItem(TOKEN_KEY, data.access_token);
  return data.access_token;
}

function redirectUri(): string {
  return `${window.location.origin}/oauth/callback`;
}

function b64u(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

interface MfbVisitedAirport {
  Code?: string;
  Aliases?: string;
  NumberOfVisits?: number;
  LatestVisitDate?: string;
}

/** Fetch visited airports via the Worker proxy (CORS insurance; stateless). */
export async function fetchVisitedAirports(token: string): Promise<FlightVisit[]> {
  const res = await fetch("/api/mfb/visited", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) {
    clearToken();
    throw new Error("MyFlightBook session expired — please reconnect");
  }
  if (!res.ok) throw new Error(`MyFlightBook fetch failed (${res.status})`);
  const visited = (await res.json()) as MfbVisitedAirport[];
  if (!Array.isArray(visited)) throw new Error("Unexpected MyFlightBook response shape");

  return visited
    .map((v): FlightVisit | null => {
      const idents = [v.Code, ...(v.Aliases?.split(",") ?? [])]
        .map((c) => c?.trim().toUpperCase())
        .filter((c): c is string => !!c && /^[A-Z0-9]{3,4}$/.test(c));
      if (idents.length === 0) return null;
      return { date: v.LatestVisitDate ?? "", idents, source: "myflightbook" };
    })
    .filter((v): v is FlightVisit => v !== null);
}
