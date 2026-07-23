# Plane State

Land them all. Complete a state.

Plane State shows pilots a state-by-state list of visited and unvisited
public-use US airports, built from their logbook. Any airport appearing in a
logged flight counts as visited.

## Architecture

One Cloudflare Worker with static assets — no separate frontend/backend deploys.

- **React SPA** (Vite + Cloudflare Vite plugin) does almost everything
  client-side: CSV parsing, airport matching, completion math. Logbook data
  never touches the server.
- **Worker routes**
  - `GET /api/airports` — serves the airport dataset from R2 (24h cache; the
    `X-Nasr-Cycle` header carries the data currency).
  - `POST /api/oauth/token` — MyFlightBook authorization-code exchange. The
    only endpoint that exists because a secret can't live in the browser.
    Stateless; nothing about users is stored.
  - `/api/admin/*` — status + manual extract re-trigger. Intended to sit
    behind a Cloudflare Access policy (see ROADMAP).
- **Daily cron** — idempotent NASR extract. Compares the current 28-day
  AIRAC cycle against R2 metadata; fetches only when a new cycle is
  effective. Daily cadence = automatic retry after a failed fetch, since
  cron triggers have no built-in retries.
- **R2** — holds one object, `airports.json` (public-use land airports with
  FAA + ICAO idents, from the FAA NASR segmented APT CSV).

## Privacy / security posture

- No database, no user accounts, no server-side storage of any user data.
- MyFlightBook tokens live in `sessionStorage` only.
- Logbook CSVs are parsed in the browser and never uploaded.
- The one secret (MyFlightBook client secret) lives in a Worker secret.

## Setup

```sh
npm install
npm run dev          # local dev (Vite + Workers runtime)
npm run deploy       # build + wrangler deploy
```

Before first deploy:

1. Create/rename the R2 bucket to match `bucket_name` in `wrangler.jsonc`.
2. `wrangler secret put MFB_CLIENT_SECRET` (once MyFlightBook issues credentials;
   set `MFB_CLIENT_ID` in `wrangler.jsonc` vars).
3. Trigger the first extract: `curl -X POST .../api/admin/extract` (behind
   Access) or wait for the daily cron.

## Data source

FAA NASR 28-day subscription, segmented CSV (APT subject only). Filtered to
`SITE_TYPE_CODE = A` (land airports) and `FACILITY_USE_CODE = PU` (public use).
Verify the download URL pattern in `worker/nasr.ts` against the current FAA
site on first run.

See `docs/ROADMAP.md` for planned work.
