/**
 * SIMULATION THEATER V2 · DRIVE TIMELINE LAYOUT (iteration 3). Pure: widths in px from drive durations and the track's
 * measured width.
 *
 * Two promises, both kept at every width:
 *   1. every segment's VISIBLE width ∝ its playback time (one px-per-ms scale for the whole run), and the segment IS
 *      its pointer target (what you see is what you hit);
 *   2. every segment is ≥ TL_MIN_TARGET px wide (WCAG 2.5.8 target size, 24 × 24 CSS px). Segments are 26–30 px tall.
 * When one row can hold the run with the shortest drive at ≥ 24 px, it is one row (mode "row", as before). Otherwise each
 * period gets its own row (mode "rows"), labelled Q1…OT at the left, on the same scale; if even the longest period
 * cannot fit one row at that scale, the scale is set so the shortest drive is exactly 24 px and a period wraps onto a
 * second line. The keyboard model is unchanged (one roving tab stop, arrows move between drives).
 */

export const TL_MIN_TARGET = 24;
export const TL_GAP = 2; // between drives in a period
export const TL_PERIOD_GAP = 4; // between periods (row mode)
export const TL_LABEL_W = 22; // period label column (rows mode)
export const TL_LABEL_GAP = 4;

const floor2 = (v) => Math.floor(v * 100) / 100;

/**
 * @param {Array<{ period: number, durs: number[] }>} groups drive durations (ms) per period, in playback order
 * @param {number} width measured track width (px)
 * @returns {{ mode: "row"|"rows", scale: number, widths: number[], rowWidth: number }}
 *   widths: per drive, in playback order; rowWidth: the width segments may use per line
 */
export function timelineLayout(groups, width) {
  const durs = groups.flatMap((g) => g.durs);
  const W = Math.max(0, width);
  if (!durs.length || W <= 0) return { mode: "row", scale: 0, widths: durs.map(() => 0), rowWidth: W };
  const minD = Math.max(1, Math.min(...durs));
  const total = durs.reduce((a, d) => a + d, 0);
  const gaps = groups.reduce((a, g) => a + (g.durs.length - 1) * TL_GAP, 0) + (groups.length - 1) * TL_PERIOD_GAP;
  const sRow = (W - gaps) / total;
  if (sRow * minD >= TL_MIN_TARGET + 0.01) {
    return { mode: "row", scale: sRow, widths: durs.map((d) => floor2(d * sRow)), rowWidth: W };
  }
  const avail = W - TL_LABEL_W - TL_LABEL_GAP;
  const fit = Math.min(...groups.map((g) => (avail - (g.durs.length - 1) * TL_GAP) / g.durs.reduce((a, d) => a + d, 0)));
  const scale = Math.max(fit, TL_MIN_TARGET / minD);
  // a single drive never exceeds a line (only possible on a pathologically narrow track)
  return { mode: "rows", scale, widths: durs.map((d) => floor2(Math.min(avail, Math.max(TL_MIN_TARGET, d * scale)))), rowWidth: avail };
}
