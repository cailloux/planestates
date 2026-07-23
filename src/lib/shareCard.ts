import { STATE_PATHS } from "../components/usStatePaths";
import { STATE_NAMES } from "../../shared/states";
import { INK, NEEDLE } from "../components/PixelCompass";
import type { StateProgress } from "./completion";

const W = 1200, H = 630;
const CREAM = "#f4f0dd", INK_C = "#23262c", MAGENTA = "#b5227a", SOFT = "#5c6068";

/**
 * Personalized share card, rendered entirely in the browser (canvas → PNG).
 * The server never sees it — pairs with the /share/:state link whose OG tags
 * carry the same stats as text.
 */
export async function renderShareCard(sp: StateProgress): Promise<Blob> {
  await document.fonts.load('700 100px "B612"');
  await document.fonts.load('400 36px "B612 Mono"');

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = INK_C;
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, W - 48, H - 48);
  ctx.lineWidth = 1;
  ctx.strokeRect(34, 34, W - 68, H - 68);

  // State silhouette, left — scaled from the map's Albers path
  const d = STATE_PATHS[sp.state];
  if (d) {
    const path = new Path2D(d);
    const bb = pathBounds(d);
    const target = 380;
    const scale = Math.min(target / bb.w, target / bb.h);
    ctx.save();
    ctx.translate(120 + (target - bb.w * scale) / 2, 125 + (target - bb.h * scale) / 2);
    ctx.scale(scale, scale);
    ctx.translate(-bb.x, -bb.y);
    const complete = sp.pct === 1;
    ctx.fillStyle = MAGENTA;
    ctx.globalAlpha = complete ? 1 : 0.12 + sp.pct * 0.6;
    ctx.fill(path);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = INK_C;
    ctx.lineWidth = 2 / scale;
    ctx.stroke(path);
    ctx.restore();
  }

  // Stats, right
  const name = STATE_NAMES[sp.state] ?? sp.state;
  ctx.fillStyle = INK_C;
  ctx.font = '700 100px "B612"';
  ctx.fillText(sp.state, 560, 230);
  ctx.font = '400 40px "B612 Mono"';
  ctx.fillText(name.toUpperCase(), 560, 290);

  ctx.fillStyle = MAGENTA;
  ctx.font = '700 64px "B612"';
  ctx.fillText(
    sp.pct === 1 ? "STATE COMPLETE" : `${Math.round(sp.pct * 100)}% COMPLETE`,
    560, 390,
  );
  ctx.fillStyle = INK_C;
  ctx.font = '400 36px "B612 Mono"';
  ctx.fillText(`${sp.visited.length} of ${sp.total} public-use airports`, 560, 450);

  // Pixel compass + wordmark, bottom
  const px = 7;
  const ox = 560, oy = 495;
  for (const [x, y] of INK) { ctx.fillStyle = INK_C; ctx.fillRect(ox + x * px, oy + y * px, px, px); }
  for (const [x, y] of NEEDLE) { ctx.fillStyle = MAGENTA; ctx.fillRect(ox + x * px, oy + y * px, px, px); }
  ctx.fillStyle = SOFT;
  ctx.font = '400 34px "B612 Mono"';
  ctx.fillText("planestates.org", ox + 130, oy + 68);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Card render failed"))), "image/png"),
  );
}

export function shareUrl(sp: StateProgress): string {
  return `${window.location.origin}/share/${sp.state}?v=${sp.visited.length}&t=${sp.total}`;
}

/** Share via the OS sheet when possible; otherwise download + return the link. */
export async function shareCard(sp: StateProgress): Promise<"shared" | "downloaded"> {
  const blob = await renderShareCard(sp);
  const file = new File([blob], `planestates-${sp.state}.png`, { type: "image/png" });
  const text = `${STATE_NAMES[sp.state] ?? sp.state}: ${sp.visited.length}/${sp.total} public-use airports`;
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], text, url: shareUrl(sp) });
    return "shared";
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(a.href);
  return "downloaded";
}

function pathBounds(d: string): { x: number; y: number; w: number; h: number } {
  const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < nums.length; i += 2) {
    minX = Math.min(minX, nums[i]); maxX = Math.max(maxX, nums[i]);
    minY = Math.min(minY, nums[i + 1]); maxY = Math.max(maxY, nums[i + 1]);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
