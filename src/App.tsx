import { useEffect, useMemo, useRef, useState } from "react";
import type { AirportDataset, FlightVisit } from "../shared/types";
import { parseLogbookCsv } from "./lib/csv/parsers";
import { computeCompletion, type StateProgress } from "./lib/completion";
import { beginAuth, clearToken, fetchVisitedAirports, getStoredToken } from "./lib/myflightbook";
import AirportRing from "./components/AirportRing";
import AdminPage from "./components/AdminPage";
import PixelCompass from "./components/PixelCompass";
import StateMap from "./components/StateMap";
import OAuthCallback from "./components/OAuthCallback";

export default function App() {
  if (window.location.pathname === "/oauth/callback") {
    return <OAuthCallback />;
  }
  if (window.location.pathname === "/admin") {
    return (
      <div className="app">
        <header className="masthead">
          <h1>
            Plane <span className="accent">States</span>
          </h1>
          <span className="legend">Admin</span>
        </header>
        <AdminPage />
      </div>
    );
  }
  return <MainApp />;
}

function MainApp() {
  const [dataset, setDataset] = useState<AirportDataset | null>(null);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [flights, setFlights] = useState<FlightVisit[]>([]);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mfbConnected, setMfbConnected] = useState(!!getStoredToken());
  const [mfbNote, setMfbNote] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;
    fetchVisitedAirports(token)
      .then((visits) => {
        setFlights((prev) => [...prev.filter((f) => f.source !== "myflightbook"), ...visits]);
        setMfbNote(`Loaded ${visits.length} visited airports from MyFlightBook.`);
      })
      .catch((err: Error) => {
        setMfbConnected(!!getStoredToken());
        setMfbNote(err.message);
      });
  }, []);

  async function connectMfb() {
    try {
      const res = await fetch("/api/config");
      const cfg = (await res.json()) as { clientId: string; oauthBase: string };
      window.location.href = await beginAuth(cfg.clientId, cfg.oauthBase);
    } catch {
      setMfbNote("Couldn't start MyFlightBook sign-in — try again.");
    }
  }

  function disconnectMfb() {
    clearToken();
    setMfbConnected(false);
    setFlights((prev) => prev.filter((f) => f.source !== "myflightbook"));
    setMfbNote("Disconnected. MyFlightBook data removed.");
  }

  useEffect(() => {
    fetch("/api/airports")
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { detail?: string };
          throw new Error(body.detail ?? `Airport data unavailable (${res.status})`);
        }
        return res.json() as Promise<AirportDataset>;
      })
      .then(setDataset)
      .catch((err: Error) => setDatasetError(err.message));
  }, []);

  const completion = useMemo(
    () => (dataset && flights.length ? computeCompletion(dataset, flights) : null),
    [dataset, flights],
  );

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    let added = 0;
    const sources = new Set<string>();
    for (const file of Array.from(list)) {
      try {
        const { flights: parsed, source } = parseLogbookCsv(await file.text());
        setFlights((prev) => [...prev, ...parsed]);
        added += parsed.length;
        sources.add(source);
      } catch (err) {
        setUploadNote(`${file.name}: ${(err as Error).message}`);
        return;
      }
    }
    setUploadNote(`Added ${added} flights (${[...sources].join(", ")}). Parsed in your browser — nothing was uploaded.`);
    // Count the event, never the content: no filenames, counts, or airports.
    for (const source of sources) {
      navigator.sendBeacon?.("/api/event", JSON.stringify({ type: "csv_upload", source }));
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  const selectedState: StateProgress | undefined = completion?.states.find(
    (s) => s.state === selected,
  );

  return (
    <div className="app">
      <header className="masthead">
        <PixelCompass size={30} />
        <h1>
          Plane <span className="accent">States</span>
        </h1>
        <span className="legend">Land them all. Complete a state.</span>
        {dataset && <span className="cycle-tag">NASR cycle {dataset.cycle}</span>}
      </header>

      <section className="panel">
        <h2>Logbook</h2>
        <div className="upload-row">
          <button className="btn primary" onClick={() => fileInput.current?.click()}>
            Upload logbook CSV
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            multiple
            hidden
            onChange={(e) => onFiles(e.target.files)}
          />
          {mfbConnected ? (
            <button className="btn" onClick={disconnectMfb}>
              Disconnect MyFlightBook
            </button>
          ) : (
            <button className="btn" onClick={connectMfb}>
              Connect MyFlightBook
            </button>
          )}
          <span className="hint">ForeFlight and Garmin Pilot exports, auto-detected.</span>
        </div>
        {uploadNote && <p className="notice ok">{uploadNote}</p>}
        {mfbNote && <p className="hint">{mfbNote}</p>}
        {datasetError && <p className="notice">{datasetError}</p>}
        {completion && (
          <p className="hint">
            {completion.visitedCount} of {completion.totalAirports} public-use US airports visited
            {completion.unmatched.length > 0 &&
              ` · ${completion.unmatched.length} idents didn't match (foreign fields, waypoints, or typos)`}
          </p>
        )}
      </section>

      {completion && !selectedState && <StateMap states={completion.states} onSelect={setSelected} />}

      {completion && !selectedState && (
        <div className="state-grid">
          {completion.states.map((sp) => (
            <button
              key={sp.state}
              className={`state-tile${sp.pct === 1 ? " complete" : ""}`}
              onClick={() => setSelected(sp.state)}
            >
              <span className="state-code">{sp.state}</span>
              <AirportRing pct={sp.pct} />
              <span className="state-count">
                {sp.visited.length}/{sp.total}
              </span>
            </button>
          ))}
        </div>
      )}

      {selectedState && (
        <>
          <div className="detail-head">
            <AirportRing pct={selectedState.pct} size={72} />
            <h2>
              {selectedState.state} — {selectedState.visited.length} of {selectedState.total}
            </h2>
            <button className="btn back" onClick={() => setSelected(null)}>
              All states
            </button>
          </div>
          <div className="airport-cols">
            <AirportList title="Visited" kind="visited" airports={selectedState.visited} />
            <AirportList title="Still to go" kind="unvisited" airports={selectedState.unvisited} />
          </div>
        </>
      )}

      {!completion && !datasetError && (
        <section className="panel">
          <h2>Getting started</h2>
          <p>
            Upload a ForeFlight or Garmin Pilot logbook export to see your state-by-state airport
            progress. Any airport appearing in a flight counts as visited. Your logbook is parsed
            entirely in your browser.
          </p>
        </section>
      )}

      <footer className="footer">
        Airport data: FAA NASR (public-use airports). Not for navigation. Your logbook never leaves
        your browser except when you connect MyFlightBook directly.
      </footer>
    </div>
  );
}

function AirportList({
  title,
  kind,
  airports,
}: {
  title: string;
  kind: "visited" | "unvisited";
  airports: { faaId: string; icaoId: string; name: string; city: string }[];
}) {
  return (
    <div className={`airport-list ${kind}`}>
      <h3>
        {title} ({airports.length})
      </h3>
      {airports.length === 0 ? (
        <p className="empty">{kind === "visited" ? "None yet — go fly." : "State complete."}</p>
      ) : (
        <ul>
          {airports.map((a) => (
            <li key={a.faaId}>
              <span className="ident">{a.icaoId || a.faaId}</span>
              <span>
                {a.name}
                {a.city ? ` · ${a.city}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
