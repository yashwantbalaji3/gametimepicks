/**
 * Which forecast families the NBA Top Boards can be built from, and where their artifacts live. Shared by the
 * freeze / grade / report scripts (I/O-free; the scripts own the reads).
 *
 * v0 / v0.1 / v0.2 come from experimental-forecast.mjs FAMILIES (the single source of truth). `v1`
 * (nba-sim-v1-coherent, dir experimental-v1) is being built on another branch: it is ACCEPTED here only by its
 * directory, and a run against it refuses cleanly while that directory holds no artifact. Once FAMILIES declares v1,
 * that declaration wins and this fallback is unused.
 */
import { FAMILIES } from "../../src/lib/sports/nba/experimental-forecast.mjs";
import { DEFAULT_BOARD_FAMILY } from "../../src/lib/sports/nba/top-boards.mjs";

export const V1_FALLBACK = Object.freeze({ family: "v1", dir: "experimental-v1", modelVersion: null, name: "nba-sim-v1-coherent" });

export function boardFamilySpec(family = DEFAULT_BOARD_FAMILY) {
  const key = String(family ?? DEFAULT_BOARD_FAMILY);
  if (FAMILIES[key]) return FAMILIES[key];
  if (key === "v1") return V1_FALLBACK;
  throw new Error(`REFUSED: unknown NBA board family ${JSON.stringify(family)} (${[...Object.keys(FAMILIES), "v1"].join(", ")})`);
}

export function parseArgs(argv) {
  const opt = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1] ?? null; };
  return { opt, flag: (n) => argv.includes(n) };
}
