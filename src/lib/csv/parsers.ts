import Papa from "papaparse";
import type { FlightVisit } from "../../../shared/types";

/**
 * Parse a logbook CSV export, auto-detecting ForeFlight vs Garmin Pilot.
 * Both are parsed entirely in the browser; file contents never leave it.
 *
 * ForeFlight: two-section file ("Aircraft Table" then "Flights Table"), with
 * the flights header on the line after the "Flights Table" marker. Airport
 * idents live in From / To / Route columns.
 *
 * Garmin Pilot: a single table whose header includes Date + From/To-style
 * columns (naming varies a bit across versions, so we match loosely).
 */
export function parseLogbookCsv(text: string): { flights: FlightVisit[]; source: FlightVisit["source"] } {
  if (/Flights Table/i.test(text)) {
    return { flights: parseForeFlight(text), source: "foreflight" };
  }
  return { flights: parseGarmin(text), source: "garmin" };
}

function parseForeFlight(text: string): FlightVisit[] {
  const lines = text.split(/\r?\n/);
  const marker = lines.findIndex((l) => /^Flights Table/i.test(l));
  if (marker === -1) throw new Error("ForeFlight export: 'Flights Table' section not found");
  const flightsCsv = lines.slice(marker + 1).join("\n");
  return parseTable(flightsCsv, "foreflight");
}

function parseGarmin(text: string): FlightVisit[] {
  // Garmin exports sometimes carry preamble lines before the real header.
  // Find the first line that looks like a header containing Date and From/To.
  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex(
    (l) => /date/i.test(l) && (/from/i.test(l) || /departure/i.test(l)),
  );
  if (headerIdx === -1) throw new Error("Garmin export: couldn't find a header row with Date and From columns");
  return parseTable(lines.slice(headerIdx).join("\n"), "garmin");
}

function parseTable(csv: string, source: FlightVisit["source"]): FlightVisit[] {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  const find = (...patterns: RegExp[]): string | undefined =>
    headers.find((h) => patterns.some((p) => p.test(h)));

  const dateCol = find(/^date$/i, /date/i);
  const fromCol = find(/^from$/i, /departure/i);
  const toCol = find(/^to$/i, /destination|arrival/i);
  const routeCol = find(/^route$/i);

  const flights: FlightVisit[] = [];
  for (const row of parsed.data) {
    const idents = new Set<string>();
    for (const col of [fromCol, toCol]) {
      if (col && row[col]) addIdent(idents, row[col]);
    }
    if (routeCol && row[routeCol]) {
      for (const token of row[routeCol].split(/[\s\-.>]+/)) addIdent(idents, token);
    }
    if (idents.size === 0) continue;
    flights.push({
      date: dateCol ? (row[dateCol] ?? "").trim() : "",
      idents: [...idents],
      source,
    });
  }
  return flights;
}

/** Keep tokens that plausibly are airport identifiers (3–4 alphanumerics). */
function addIdent(set: Set<string>, raw: string): void {
  const t = raw.trim().toUpperCase();
  if (/^[A-Z0-9]{3,4}$/.test(t)) set.add(t);
}
