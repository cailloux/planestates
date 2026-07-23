/**
 * Progress ring drawn as a sectional-chart airport symbol: a magenta circle
 * with runway tick marks, filling clockwise as a state gets completed.
 */
export default function AirportRing({ pct, size = 64 }: { pct: number; size?: number }) {
  const r = size * 0.36;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct));
  const tick = size * 0.11;

  return (
    <svg
      className="ring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${Math.round(clamped * 100)} percent complete`}
    >
      <g className="ring-ticks">
        {[0, 90, 180, 270].map((deg) => (
          <line
            key={deg}
            x1={c}
            y1={c - r - tick}
            x2={c}
            y2={c - r - tick * 0.35}
            transform={`rotate(${deg} ${c} ${c})`}
          />
        ))}
      </g>
      <circle className="ring-track" cx={c} cy={c} r={r} fill="none" strokeWidth={size * 0.09} />
      <circle
        className="ring-progress"
        cx={c}
        cy={c}
        r={r}
        fill="none"
        strokeWidth={size * 0.09}
        strokeLinecap="butt"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
        transform={`rotate(-90 ${c} ${c})`}
      />
      <text className="ring-pct" x={c} y={c + 4} textAnchor="middle">
        {Math.round(clamped * 100)}
      </text>
    </svg>
  );
}
