// Type-only import (erased at runtime). The runtime module is loaded lazily
// inside sendEmail() so that environments lacking the send_email binding
// (e.g. version previews) can still instantiate the Worker — a top-level
// import makes email a startup dependency, which alerting should never be.
import type { EmailMessage as EmailMessageType } from "cloudflare:email";

/**
 * Staleness alerting via Cloudflare Email Routing's send_email binding.
 *
 * Constraints of the binding (why setup looks the way it does):
 *  - The FROM address must be on a domain in your Cloudflare account with
 *    Email Routing enabled (e.g. alerts@planestates.com).
 *  - The TO address must be a verified destination address in Email Routing.
 * No SMTP service, no API key — consistent with the zero-secrets posture.
 *
 * Alert policy: one email per stale NASR cycle, sent only after
 * ALERT_GRACE_DAYS have elapsed since the cycle became effective (the FAA
 * sometimes posts late; a same-day alert would mostly be noise). The daily
 * cron retries the extract anyway, so the email exists for the case where
 * retries aren't going to fix it — URL pattern change, format change, etc.
 */

export interface EmailEnv {
  EMAIL?: { send(message: EmailMessageType): Promise<void> };
  ALERT_FROM?: string;
  ALERT_TO?: string;
  ALERT_GRACE_DAYS?: string;
}

const ALERT_STATE_KEY = "alert-state.json";

export function emailConfigured(env: EmailEnv): boolean {
  return Boolean(env.EMAIL && env.ALERT_FROM && env.ALERT_TO);
}

export async function sendEmail(env: EmailEnv, subject: string, body: string): Promise<void> {
  if (!emailConfigured(env)) {
    console.log(`email not configured; would have sent: ${subject}`);
    return;
  }
  const raw = [
    `From: Plane States <${env.ALERT_FROM}>`,
    `To: ${env.ALERT_TO}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@planestates>`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    body,
  ].join("\r\n");
  const { EmailMessage } = await import("cloudflare:email");
  await env.EMAIL!.send(new EmailMessage(env.ALERT_FROM!, env.ALERT_TO!, raw));
}

/**
 * Called by the daily cron after a failed extract (and harmless to call any
 * time). Sends at most one alert per stale cycle, tracked in R2.
 */
export async function alertIfStale(
  env: EmailEnv,
  bucket: R2Bucket,
  currentCycleIso: string,
  currentCycleDate: Date,
  storedCycleIso: string | null,
  lastError: string,
): Promise<void> {
  if (storedCycleIso === currentCycleIso) return; // not stale

  const graceDays = Number(env.ALERT_GRACE_DAYS ?? "3");
  const daysSinceEffective = (Date.now() - currentCycleDate.getTime()) / 86_400_000;
  if (daysSinceEffective < graceDays) return; // within grace period

  const state = await bucket.get(ALERT_STATE_KEY);
  if (state) {
    const parsed = (await state.json().catch(() => null)) as { alertedCycle?: string } | null;
    if (parsed?.alertedCycle === currentCycleIso) return; // already alerted for this cycle
  }

  await sendEmail(
    env,
    `Plane States: airport data is stale (cycle ${currentCycleIso})`,
    [
      `The NASR extract has not succeeded for cycle ${currentCycleIso}, which became`,
      `effective ${Math.floor(daysSinceEffective)} days ago.`,
      ``,
      `Stored cycle: ${storedCycleIso ?? "none"}`,
      `Latest error: ${lastError}`,
      ``,
      `The daily cron keeps retrying automatically. If this is a URL or format`,
      `change on the FAA side, fix it and re-trigger from /admin.`,
    ].join("\r\n"),
  );

  await bucket.put(ALERT_STATE_KEY, JSON.stringify({ alertedCycle: currentCycleIso, at: new Date().toISOString() }), {
    httpMetadata: { contentType: "application/json" },
  });
}
