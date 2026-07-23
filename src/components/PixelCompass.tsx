/**
 * 8-bit compass rose — Plane States' mark. Hand-placed pixels on a 15×15
 * grid: ink ring + cardinal/ordinal points, magenta needle pointing north.
 * Rendered as SVG rects with crispEdges so it stays pixel-sharp at any size.
 * public/favicon.svg is the same drawing with hardcoded colors.
 */

// Ink pixels: [x, y]
const INK: [number, number][] = [
  // N arm
  [7, 0], [6, 1], [7, 1], [8, 1], [7, 2], [7, 3],
  // S arm
  [7, 14], [6, 13], [7, 13], [8, 13], [7, 12], [7, 11],
  // W arm
  [0, 7], [1, 6], [1, 7], [1, 8], [2, 7], [3, 7],
  // E arm
  [14, 7], [13, 6], [13, 7], [13, 8], [12, 7], [11, 7],
  // Ring (octagonal)
  [6, 4], [7, 4], [8, 4],
  [5, 5], [9, 5],
  [4, 6], [10, 6],
  [4, 7], [10, 7],
  [4, 8], [10, 8],
  [5, 9], [9, 9],
  [6, 10], [7, 10], [8, 10],
  // Ordinal points
  [3, 3], [4, 4], [11, 3], [10, 4],
  [3, 11], [4, 10], [11, 11], [10, 10],
];

// Magenta needle (points north)
const NEEDLE: [number, number][] = [
  [7, 5], [6, 6], [7, 6], [8, 6], [7, 7], [7, 8],
];

export default function PixelCompass({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 15 15"
      shapeRendering="crispEdges"
      role="img"
      aria-label="Plane States compass"
    >
      {INK.map(([x, y]) => (
        <rect key={`i${x}-${y}`} x={x} y={y} width="1" height="1" fill="var(--ink)" />
      ))}
      {NEEDLE.map(([x, y]) => (
        <rect key={`n${x}-${y}`} x={x} y={y} width="1" height="1" fill="var(--magenta)" />
      ))}
    </svg>
  );
}
