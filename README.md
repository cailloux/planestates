# Plane States

🧭 Land them all. Complete a state. — **[planestates.org](https://planestates.org)**

Plane States shows pilots a state-by-state view of visited and unvisited
public-use US airports, built from their logbook. Any airport appearing in a
logged flight counts as visited.

## Features

- **Three logbook sources**: ForeFlight and Garmin Pilot CSV exports (parsed
  entirely in the browser, auto-detected) and MyFlightBook via OAuth.
- **US choropleth map** (AlbersUSA with AK/HI insets) plus a tile grid that
  covers the territories; both fill toward sectional magenta with progress.
- **Shareable cards**: canvas-rendered state cards (Web Share API or PNG
  download) plus `/share/:state` links that unfurl with personalized stats.
- **Self-updating airport data** from FAA NASR on the 28-day AIRAC cycle.

## Architecture

One Cloudflare Worker with static assets — a single deployable for the React
SPA, the API, and the data pipeline.

- **React SPA** (Vite + Cloudflare Vite plugin) does almost everything
  client-side: CSV parsing, airport matching, completion math, card
  rendering. Logbook data never touches the server.
- **Worker routes**
  - `GET /api/airports` — airport dataset from R2 (24h cache; `X-Nasr-Cycle`
    header carries data currency).
  - `POST /api/oauth/token` — MyFlightBook PKCE code exchange. Stateless
    relay; exists only as CORS insurance.
  - `GET /api/mfb/visited` — stateless proxy for MyFlightBook's
    VisitedAirports resource (forwards the bearer token, stores nothing).
  - `GET /api/config` — public client config for the SPA.
  - `POST /api/event` — whitelisted, anonymous analytics beacon.
  - `GET /share/:state` — share pages with personalized OG text and a static
    branded image.
  - `/api/admin/*` — status, manual extract trigger, test email. Gated by a
    Cloudflare Access policy **and** full Access JWT signature verification
    in `worker/access.ts` (fails closed if unconfigured).
- **Daily cron** — idempotent NASR extract: compares the current AIRAC cycle
  against R2 metadata and fetches only when a new cycle is effective, so a
  failed fetch retries automatically the next day. On persistent staleness it
  emails (below).
- **Email alerts** — Email Routing `send_email` binding; at most one alert
  per stale cycle after a grace period (`ALERT_GRACE_DAYS`). No SMTP service,
  no API keys.
- **Analytics Engine** — anonymous event counts only (pageviews, uploads,
  connects, shares). No IPs, no user identifiers, no airport codes. Queried
  externally via the SQL API; see `worker/analytics.ts`.
- **R2** — `airports.json` (public-use land airports, FAA + ICAO idents) and
  a tiny alert-state marker.

## Privacy / security posture

- **Zero secrets.** MyFlightBook uses a PKCE public client — no client
  secret exists anywhere. (`ALERT_TO` is stored as a Worker secret, but
  that's private config, not a credential.)
- No database, no user accounts, no server-side storage of any user data.
- The MyFlightBook scope is `visited` only — the app never sees flights,
  dates, aircraft, or hours; tokens live in `sessionStorage` and die with
  the tab.
- Logbook CSVs are parsed in the browser and never uploaded.
- Admin routes verify Access JWT signatures server-side; a forged header
  doesn't pass.
- Zone WAF rate limiting on `/api/oauth/*` and `/api/mfb/*`.

## Deployment

CI/CD via Cloudflare Workers Builds: pushes to `main` deploy to production
(`planestates.org` is the only production origin — `workers_dev: false`);
non-production branches run `wrangler versions upload` and get preview URLs
(`preview_urls: true`). Dependabot handles dependency updates, with the
React ecosystem grouped so lockstep majors arrive as one PR.

Config rule of thumb: anything wrangler can express lives in
`wrangler.jsonc` and the dashboard is treated as read-only for it — deploys
overwrite dashboard edits. Dashboard-durable exceptions: secrets, Access
apps, Email Routing, WAF rules, and the Builds connection itself.

## Local development

```sh
npm install
npm run dev          # Vite + local workerd; simulated bindings, no token needed
npm run build        # type-check + build
```

OAuth can't be exercised on localhost (MyFlightBook callbacks are
https-only) — use a branch preview URL for end-to-end OAuth testing.

## Standing up a new environment

1. Create the R2 bucket named in `wrangler.jsonc` (`bucket_name`).
2. Connect the repo in Workers Builds (deploy command `npx wrangler deploy`,
   non-prod command `npx wrangler versions upload`).
3. Zero Trust: create an Access app covering `/admin` and `/api/admin` on
   the production hostname; copy its AUD tag and your team domain into
   `ACCESS_AUD` / `ACCESS_TEAM_DOMAIN`.
4. Email Routing: enable on the zone, verify the destination address, set
   `ALERT_TO` as a Worker secret (`wrangler secret put ALERT_TO`).
5. MyFlightBook: create a PKCE public client with callback
   `https://<host>/oauth/callback`; put its id in `MFB_CLIENT_ID`.
6. Visit `/admin` → "Run extract now" for the first dataset (or wait for the
   daily cron), and "Send test email" to verify alerting.

## Data source

FAA NASR 28-day subscription, segmented CSV (APT subject only), filtered to
`SITE_TYPE_CODE = A` (land airports) and `FACILITY_USE_CODE = PU` (public
use). AIRAC epoch anchored at 2024-01-25 in `worker/nasr.ts`. Map outlines
generated at build time from the public-domain us-atlas dataset — no runtime
map dependencies.

See `docs/ROADMAP.md` for remaining ideas.

---

🛩️ Built by [Tim Cailloux](https://atlantacfi.co)
