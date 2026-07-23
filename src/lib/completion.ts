import type { Airport, AirportDataset, FlightVisit } from "../../shared/types";

export interface StateProgress {
  state: string;
  total: number;
  visited: Airport[];
  unvisited: Airport[];
  /** 0..1 */
  pct: number;
}

export interface CompletionResult {
  states: StateProgress[];
  /** Idents from the logbook that matched nothing (foreign, typos, waypoints). */
  unmatched: string[];
  visitedCount: number;
  totalAirports: number;
}

/**
 * Build a lookup covering the ways pilots log US airports:
 *  - ICAO ident as-is (KPDK)
 *  - FAA ident as-is (PDK, or alphanumerics like GA04)
 * Logged idents are also tried with a leading K stripped, since "KPDK" in a
 * logbook and FAA "PDK" are the same field.
 */
export function buildIndex(dataset: AirportDataset): Map<string, Airport> {
  const index = new Map<string, Airport>();
  for (const apt of dataset.airports) {
    if (apt.icaoId) index.set(apt.icaoId, apt);
    // Don't let an FAA ident collide with a different airport's ICAO ident.
    if (apt.faaId && !index.has(apt.faaId)) index.set(apt.faaId, apt);
  }
  return index;
}

export function matchIdent(index: Map<string, Airport>, ident: string): Airport | undefined {
  const direct = index.get(ident);
  if (direct) return direct;
  if (ident.length === 4 && ident.startsWith("K")) {
    return index.get(ident.slice(1));
  }
  return undefined;
}

export function computeCompletion(dataset: AirportDataset, flights: FlightVisit[]): CompletionResult {
  const index = buildIndex(dataset);
  const visitedAirports = new Set<Airport>();
  const unmatched = new Set<string>();

  for (const flight of flights) {
    for (const ident of flight.idents) {
      const apt = matchIdent(index, ident);
      if (apt) visitedAirports.add(apt);
      else unmatched.add(ident);
    }
  }

  const byState = new Map<string, StateProgress>();
  for (const apt of dataset.airports) {
    let sp = byState.get(apt.state);
    if (!sp) {
      sp = { state: apt.state, total: 0, visited: [], unvisited: [], pct: 0 };
      byState.set(apt.state, sp);
    }
    sp.total++;
    if (visitedAirports.has(apt)) sp.visited.push(apt);
    else sp.unvisited.push(apt);
  }

  const states = [...byState.values()]
    .map((sp) => ({ ...sp, pct: sp.total ? sp.visited.length / sp.total : 0 }))
    .sort((a, b) => b.pct - a.pct || a.state.localeCompare(b.state));

  return {
    states,
    unmatched: [...unmatched].sort(),
    visitedCount: visitedAirports.size,
    totalAirports: dataset.airports.length,
  };
}
