/**
 * Usage analytics via Workers Analytics Engine.
 *
 * Deliberately minimal: event names and coarse sources only. No IPs, no user
 * identifiers, no airport codes — a user's flight history is theirs, and the
 * app's no-server-side-user-data property extends to analytics.
 *
 * Write-only from the Worker. Querying happens outside via the SQL API with
 * your own account token, keeping the Worker's zero-secrets property:
 *
 *   curl -s "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/analytics_engine/sql" \
 *     -H "Authorization: Bearer <API_TOKEN>" \
 *     -d "SELECT blob1 AS event, blob2 AS source, SUM(_sample_interval) AS count
 *         FROM planestates_events
 *         WHERE timestamp > NOW() - INTERVAL '7' DAY
 *         GROUP BY event, source ORDER BY count DESC"
 */

export interface AnalyticsEnv {
  ANALYTICS?: AnalyticsEngineDataset;
}

/** Events the client is allowed to report via /api/event. */
const CLIENT_EVENTS = new Set(["csv_upload", "card_share"]);
const SOURCES = new Set(["foreflight", "garmin", "myflightbook", ""]);

/** Fire-and-forget; analytics must never affect the request path. */
export function track(env: AnalyticsEnv, event: string, source = ""): void {
  try {
    env.ANALYTICS?.writeDataPoint({
      blobs: [event, source],
      doubles: [1],
      indexes: [event],
    });
  } catch (err) {
    console.warn(`analytics write failed: ${err}`);
  }
}

/** POST /api/event — beacon endpoint for client-side events (whitelisted). */
export async function handleEvent(request: Request, env: AnalyticsEnv): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }
  try {
    const body = (await request.json()) as { type?: string; source?: string };
    const type = body.type ?? "";
    const source = body.source ?? "";
    if (CLIENT_EVENTS.has(type) && SOURCES.has(source)) {
      track(env, type, source);
    }
    // Always 204, even for junk: this endpoint reveals nothing and retries help no one.
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 204 });
  }
}
