import { unzipSync, strFromU8 } from "fflate";
import type { Airport, AirportDataset } from "../shared/types";

export interface NasrEnv {
  AIRPORT_DATA: R2Bucket;
  NASR_BASE_URL: string;
}

export const DATASET_KEY = "airports.json";

/**
 * AIRAC epoch: cycle 2401 became effective 2024-01-25. Cycles advance every
 * 28 days, worldwide, forever. NASR releases align to these dates.
 */
const AIRAC_EPOCH_UTC = Date.UTC(2024, 0, 25);
const CYCLE_MS = 28 * 24 * 60 * 60 * 1000;

/** The most recent cycle effective date <= now, as a UTC Date. */
export function currentCycleDate(now: Date = new Date()): Date {
  const elapsed = now.getTime() - AIRAC_EPOCH_UTC;
  const cycles = Math.floor(elapsed / CYCLE_MS);
  return new Date(AIRAC_EPOCH_UTC + cycles * CYCLE_MS);
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** e.g. "23_Jul_2026" — the format FAA uses in segmented CSV filenames. */
function faaDateSlug(d: Date): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${dd}_${months[d.getUTCMonth()]}_${d.getUTCFullYear()}`;
}

/**
 * Idempotent extract. Called by the daily cron and by the admin re-trigger.
 * Returns a human-readable status string (logged; surfaced by the admin API).
 */
export async function runExtract(env: NasrEnv, force = false): Promise<string> {
  const cycle = currentCycleDate();
  const cycleIso = isoDate(cycle);

  if (!force) {
    const head = await env.AIRPORT_DATA.head(DATASET_KEY);
    const storedCycle = head?.customMetadata?.cycle;
    if (storedCycle === cycleIso) {
      return `up-to-date (cycle ${cycleIso})`;
    }
  }

  // Segmented CSV download: only the airport (APT) subject file, a few MB —
  // small enough to process comfortably within Worker memory limits.
  const url = `${env.NASR_BASE_URL}/${faaDateSlug(cycle)}_APT_CSV.zip`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`NASR download failed: ${res.status} ${url}`);
  }
  const zipBytes = new Uint8Array(await res.arrayBuffer());
  const files = unzipSync(zipBytes);

  const aptBaseName = Object.keys(files).find((f) => /APT_BASE\.csv$/i.test(f));
  if (!aptBaseName) {
    throw new Error(`APT_BASE.csv not found in ${url}; entries: ${Object.keys(files).join(", ")}`);
  }

  const airports = parseAptBase(strFromU8(files[aptBaseName]));
  const dataset: AirportDataset = {
    cycle: cycleIso,
    generatedAt: new Date().toISOString(),
    airports,
  };

  await env.AIRPORT_DATA.put(DATASET_KEY, JSON.stringify(dataset), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { cycle: cycleIso, count: String(airports.length) },
  });

  return `extracted ${airports.length} public-use airports (cycle ${cycleIso})`;
}

/**
 * Parse APT_BASE.csv, keeping public-use land airports only.
 * Header-indexed so FAA column reordering between cycles doesn't break us.
 */
export function parseAptBase(csv: string): Airport[] {
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new Error("APT_BASE.csv appears empty");

  const header = rows[0].map((h) => h.trim().toUpperCase());
  const col = (name: string): number => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`APT_BASE.csv missing expected column ${name}`);
    return i;
  };

  const cSiteType = col("SITE_TYPE_CODE");   // 'A' = airport (vs heliport, seaplane base…)
  const cUse = col("FACILITY_USE_CODE");     // 'PU' = open to the public
  const cFaaId = col("ARPT_ID");
  const cIcao = col("ICAO_ID");
  const cName = col("ARPT_NAME");
  const cCity = col("CITY");
  const cState = col("STATE_CODE");
  const cLat = col("LAT_DECIMAL");
  const cLon = col("LONG_DECIMAL");

  const airports: Airport[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length <= cLon) continue;
    if (row[cSiteType]?.trim() !== "A") continue;
    if (row[cUse]?.trim() !== "PU") continue;
    const state = row[cState]?.trim();
    if (!state) continue; // rows without a state can't count toward one
    airports.push({
      faaId: row[cFaaId].trim(),
      icaoId: row[cIcao]?.trim() ?? "",
      name: row[cName]?.trim() ?? "",
      city: row[cCity]?.trim() ?? "",
      state,
      lat: Number(row[cLat]) || 0,
      lon: Number(row[cLon]) || 0,
    });
  }
  return airports;
}

/** Minimal RFC-4180-ish CSV parser (quotes, embedded commas/newlines). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}
