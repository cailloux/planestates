# Roadmap

## Near-term (needed for launch)
- [ ] Request MyFlightBook OAuth credentials (human-latency — start early).
- [ ] Implement `fetchFlights` in `src/lib/myflightbook.ts` against the
      authenticated MyFlightBook API; map route strings → visited airports
      (any airport in a flight counts — decided 2026-07: landing-level parsing
      isn't reliably possible across sources, and this is for fun).
- [ ] Verify FAA NASR segmented-CSV URL pattern on first real extract; the
      base URL is a `wrangler.jsonc` var so it can change without a code edit.
- [ ] CORS check: if MyFlightBook's API rejects browser calls, add a stateless
      pass-through proxy route in the Worker (forward the token, store nothing).
- [ ] Rate-limiting rule on `/api/oauth/token` (Cloudflare dashboard config).

## Admin (placeholder exists at /api/admin/*)
- [ ] Cloudflare Access policy for `/api/admin/*` (Zero Trust dashboard).
- [ ] Full Access JWT signature validation in the Worker (currently only
      checks header presence — not sufficient alone).
- [ ] Minimal admin UI page: show `/api/admin/status`, button to POST
      `/api/admin/extract`.

## Alerting
- [ ] Email Routing `send_email` binding; alert when stored cycle lags the
      current cycle beyond a grace period (e.g. 3 days). The daily cron
      already knows staleness — it just logs today.

## Ideas / later
- [ ] US map view (SVG choropleth) alongside the tile grid.
- [ ] Shareable "state completed" card generation.
- [ ] Filter toggles (include private-use, heliports, seaplane bases) —
      denominator choices as user preference rather than app opinion.
- [ ] Analytics Engine for cookie-less usage counts.
