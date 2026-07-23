// Types shared between the Worker and the React app.

/** One public-use airport from the FAA NASR extract. */
export interface Airport {
  /** FAA location identifier, e.g. "PDK" */
  faaId: string;
  /** ICAO identifier when assigned, e.g. "KPDK" (empty string if none) */
  icaoId: string;
  name: string;
  city: string;
  /** Two-letter state/territory code from NASR, e.g. "GA" */
  state: string;
  lat: number;
  lon: number;
}

/** The airports.json document the Worker writes to R2. */
export interface AirportDataset {
  /** AIRAC/NASR cycle effective date, ISO yyyy-mm-dd. */
  cycle: string;
  /** When the extract ran, ISO timestamp. */
  generatedAt: string;
  airports: Airport[];
}

/** A flight reduced to the only things Plane States cares about. */
export interface FlightVisit {
  /** ISO date of the flight (best effort from the source). */
  date: string;
  /** Raw airport identifiers appearing in the flight (from/to/route). */
  idents: string[];
  /** Where this flight came from. */
  source: "foreflight" | "garmin" | "myflightbook";
}
