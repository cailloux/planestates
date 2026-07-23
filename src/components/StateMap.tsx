import { MAP_VIEWBOX, STATE_PATHS } from "./usStatePaths";
import type { StateProgress } from "../lib/completion";

/**
 * Dependency-free US choropleth: pre-projected AlbersUSA outlines (AK/HI as
 * insets) baked in at build time — no map library, no runtime fetches.
 *
 * Fill encodes completion: chart-toned for untouched states, deepening toward
 * sectional magenta with progress, solid magenta when complete. Territories
 * (PR, VI, GU…) have no outline here and live in the tile grid below —
 * which also remains the accessible/mobile path, so the map stays a
 * pointer-first enhancement rather than the only way in.
 */
export default function StateMap({
  states,
  onSelect,
}: {
  states: StateProgress[];
  onSelect: (state: string) => void;
}) {
  const byState = new Map(states.map((s) => [s.state, s]));

  return (
    <div className="state-map panel">
      <svg viewBox={MAP_VIEWBOX} role="img" aria-label="US map of state completion">
        {Object.entries(STATE_PATHS).map(([code, d]) => {
          const sp = byState.get(code);
          const pct = sp?.pct ?? 0;
          const complete = sp ? sp.pct === 1 : false;
          return (
            <path
              key={code}
              d={d}
              className={`map-state${complete ? " complete" : ""}${sp ? "" : " nodata"}`}
              style={sp && !complete ? { fillOpacity: 0.06 + pct * 0.74 } : undefined}
              onClick={sp ? () => onSelect(code) : undefined}
            >
              <title>
                {sp
                  ? `${code} — ${sp.visited.length}/${sp.total} (${Math.round(pct * 100)}%)`
                  : `${code} — no public-use airports in dataset`}
              </title>
            </path>
          );
        })}
      </svg>
      <p className="hint map-note">
        Territories (PR, VI, GU…) don't fit the map — find them in the grid below.
      </p>
    </div>
  );
}
