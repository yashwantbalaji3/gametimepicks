/**
 * SIMULATION THEATER V2 · SCENE RNG — cosmetic randomness only (spec §3.6). Pure.
 *
 * sceneSeed = fnv1a32("drive-scene@1|" + simulationReceiptId + "|" + runIndex), feeding a local mulberry32.
 * Used ONLY for the ball's lateral lane (y within the middle 40% of the field, so consecutive ribbons do not overlap)
 * and the turf grain offset. It never imports or calls the engine's runRng, and no outcome field depends on it — the
 * lane is why the field's y-axis is declared data-free.
 */

export const SCENE_VERSION = "drive-scene@1";

/** 32-bit FNV-1a over UTF-16 code units, as an unsigned integer. */
export function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 → a function returning floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const sceneSeedOf = (receiptId, runIndex, sceneVersion = SCENE_VERSION) => fnv1a32(`${sceneVersion}|${receiptId}|${runIndex}`);

/**
 * One lateral lane per drive, as a fraction of field width in [0.30, 0.70]. Consecutive lanes differ by at least
 * 0.08 so neighbouring ribbons never sit on top of each other.
 */
export function lanesFor(seed, count) {
  const rnd = mulberry32(seed);
  const lanes = [];
  let prev = 0.5;
  for (let i = 0; i < count; i++) {
    let lane = 0.3 + rnd() * 0.4;
    if (Math.abs(lane - prev) < 0.08) lane = lane + 0.08 > 0.7 ? lane - 0.08 : lane + 0.08;
    lanes.push(Number(lane.toFixed(4)));
    prev = lane;
  }
  return lanes;
}

/** Grain offset in [0, 64) user units: cosmetic only. */
export const grainOffsetOf = (seed) => (seed % 64);
