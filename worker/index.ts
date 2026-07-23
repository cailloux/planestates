import { runExtract, currentCycleDate, isoDate, DATASET_KEY, type NasrEnv } from "./nasr";
import { handleTokenExchange, handleVisitedProxy, type OAuthEnv } from "./oauth";
import { verifyAccessJwt, type AccessEnv } from "./access";
import { alertIfStale, emailConfigured, sendEmail, type EmailEnv } from "./email";

export interface Env extends NasrEnv, OAuthEnv, AccessEnv, EmailEnv {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/airports") {
      return serveAirports(env);
    }
    if (url.pathname === "/api/oauth/token") {
      return handleTokenExchange(request, env);
    }
    if (url.pathname === "/api/mfb/visited") {
      return handleVisitedProxy(request, env);
    }
    if (url.pathname === "/api/config") {
      // Public client config for the SPA — nothing here is sensitive.
      return json({ clientId: env.MFB_CLIENT_ID, oauthBase: env.MFB_OAUTH_BASE });
    }
    if (url.pathname.startsWith("/api/admin/")) {
      return handleAdmin(request, env, url);
    }
    if (url.pathname.startsWith("/api/")) {
      return json({ error: "not_found" }, 404);
    }

    // Everything else: the React app (SPA fallback handled by assets config).
    return env.ASSETS.fetch(request);
  },

  /**
   * Daily cron (idempotent). Fetches a new NASR cycle only when one is
   * effective; otherwise no-ops. Daily cadence gives us free retry-on-failure
   * since cron triggers have no built-in retries.
   */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runExtract(env)
        .then((status) => console.log(`nasr extract: ${status}`))
        .catch(async (err) => {
          console.error(`nasr extract failed: ${err}`);
          // Alert (at most once per stale cycle, after a grace period) when
          // retries alone aren't fixing it — see worker/email.ts.
          try {
            const cycle = currentCycleDate();
            const head = await env.AIRPORT_DATA.head(DATASET_KEY);
            await alertIfStale(env, env.AIRPORT_DATA, isoDate(cycle), cycle, head?.customMetadata?.cycle ?? null, String(err));
          } catch (alertErr) {
            console.error(`staleness alert failed: ${alertErr}`);
          }
        }),
    );
  },
} satisfies ExportedHandler<Env>;

/** Serve airports.json from R2 with strong caching (changes every 28 days). */
async function serveAirports(env: Env): Promise<Response> {
  const obj = await env.AIRPORT_DATA.get(DATASET_KEY);
  if (!obj) {
    return json(
      { error: "no_data", detail: "Airport dataset not yet extracted. Trigger via /api/admin/extract or wait for the daily cron." },
      503,
    );
  }
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400",
      "ETag": obj.httpEtag,
      "X-Nasr-Cycle": obj.customMetadata?.cycle ?? "unknown",
    },
  });
}

/**
 * Admin endpoints.
 *
 * Two layers of protection:
 *  1. A Cloudflare Access policy on /api/admin/* (Zero Trust dashboard) — this
 *     is what actually gates browser access with SSO.
 *  2. Signature verification of the Access JWT here (worker/access.ts), so a
 *     forged header or a request that somehow bypasses Access still fails.
 * Fails closed when ACCESS_TEAM_DOMAIN / ACCESS_AUD are unset.
 */
async function handleAdmin(request: Request, env: Env, url: URL): Promise<Response> {
  const access = await verifyAccessJwt(request, env);
  if (!access.ok) {
    return json({ error: "forbidden", detail: access.reason }, 403);
  }

  if (url.pathname === "/api/admin/extract" && request.method === "POST") {
    const status = await runExtract(env, /* force */ true);
    return json({ ok: true, status });
  }

  if (url.pathname === "/api/admin/test-email" && request.method === "POST") {
    if (!emailConfigured(env)) {
      return json({ ok: false, detail: "Email not configured (EMAIL binding / ALERT_FROM / ALERT_TO)" }, 503);
    }
    await sendEmail(env, "Plane States: test alert", "The send_email binding works. Staleness alerts will arrive like this.");
    return json({ ok: true, status: `test email sent to ${env.ALERT_TO}` });
  }

  if (url.pathname === "/api/admin/status") {
    const head = await env.AIRPORT_DATA.head(DATASET_KEY);
    return json({
      currentCycle: isoDate(currentCycleDate()),
      storedCycle: head?.customMetadata?.cycle ?? null,
      airportCount: head?.customMetadata?.count ?? null,
      lastGenerated: head?.uploaded ?? null,
    });
  }

  return json({ error: "not_found" }, 404);
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
