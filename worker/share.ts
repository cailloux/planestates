import { STATE_NAMES } from "../shared/states";

/**
 * /share/:state?v=..&t=.. — shareable page whose only job is unfurling well.
 * Hybrid design: the OG *image* is static branding (og-card.png), while the
 * OG title/description carry the personalized stats from the URL the user
 * chose to share. No storage, no rendering pipeline, nothing sensitive:
 * the server only ever echoes back what's in the link.
 */
export function handleShare(url: URL): Response {
  const code = (url.pathname.split("/")[2] ?? "").toUpperCase();
  const name = STATE_NAMES[code];
  if (!name) return Response.redirect(`${url.origin}/`, 302);

  const v = clamp(url.searchParams.get("v"));
  const t = clamp(url.searchParams.get("t"));
  const complete = t > 0 && v >= t;
  const pct = t > 0 ? Math.round((Math.min(v, t) / t) * 100) : 0;

  const title = complete
    ? `🧭 ${name}: STATE COMPLETE — Plane States`
    : `🧭 ${name}: ${pct}% complete — Plane States`;
  const desc =
    t > 0
      ? `${Math.min(v, t)} of ${t} public-use airports visited in ${name}. Land them all.`
      : `Tracking visited airports in ${name}, one landing at a time.`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="Plane States">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${url.origin}/og-card.png">
<meta property="og:url" content="${url.origin}${url.pathname}${url.search}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>body{font-family:system-ui,sans-serif;background:#f4f0dd;color:#23262c;display:grid;place-items:center;min-height:100vh;margin:0}
main{text-align:center;padding:24px}h1{font-size:1.6rem}a{display:inline-block;margin-top:12px;padding:10px 18px;background:#b5227a;color:#fff;text-decoration:none;border-radius:2px}</style>
</head><body><main><h1>${title.replace("🧭 ", "")}</h1><p>${desc}</p>
<a href="/">Track your own states →</a></main></body></html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}

function clamp(s: string | null): number {
  const n = Number.parseInt(s ?? "", 10);
  return Number.isFinite(n) && n >= 0 && n <= 20000 ? n : 0;
}
