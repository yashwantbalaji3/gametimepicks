/**
 * NBA SIMULATION THEATER · POSSESSION RUNS · WHICH STORED RUNS THE THEATER SHOWS (pure, deterministic, client-safe).
 *
 * The possession engine (nba-possession-sim-v0, research) is NOT the official forecast. The Theater shows a handful of
 * its seeded runs beside the official projection. Which runs, from a FIXED SEED POOL (runIndex 0 … poolSize − 1 of the
 * engine's own seed policy, seed = hash(providerEventId)), is decided here by documented rules — never by hand:
 *
 *   DEFAULT (the run the Theater opens on). The official-representative rule of lib/consistency/representative.mjs
 *     (`official-representative@2`) applied to the possession pool: distance = the normalised distance of the run's
 *     player lines to the OFFICIAL v0.1 player expectations (team terms are WITHHELD for NBA, so there are none), and
 *     the SIDE CONSTRAINT — only runs won by the official Elo favoured side are eligible. Smallest distance wins; ties →
 *     lowest runIndex. It is labelled "Simulated game · one supporting-simulation run" (gate policy
 *     LABELLED_SUPPORTING_RUNS), never "official".
 *   UPSET what-if. The same distance, but only runs won by the side the official forecast does NOT favour; smallest
 *     distance wins (the most ordinary-looking upset), ties → lowest runIndex.
 *   HIGH-SCORING what-if. The run whose total points is closest to the pool's 90th-percentile total (nearest-rank,
 *     the engine's own quantile rule); ties → smaller distance → lowest runIndex. A high-scoring game, not the most
 *     extreme draw.
 *   LOW-SCORING what-if. The same at the pool's 10th-percentile total.
 *   OVERTIME what-if (only if the pool holds an overtime run). The overtime run with the smallest distance; ties →
 *     lowest runIndex.
 * Picks are made in that order and each excludes the runs already picked (one run never carries two roles); a rule
 * with no remaining candidate yields nothing (recorded), never a substitute. Every what-if is labelled hypothetical and
 * never changes the official projection panel (which is built from the official snapshot only, never from a run).
 */
import { runDistance } from "../../../consistency/representative.mjs";

export const POSSESSION_SELECTION_VERSION = "nba-theater-possession-selection@1";
export const DEFAULT_POOL_SIZE = 1000;

export const POSSESSION_RUN_KIND = Object.freeze({ DEFAULT: "default", UPSET: "upset", HIGH: "high", LOW: "low", OVERTIME: "overtime" });

export const POSSESSION_SELECTION_RULES = Object.freeze({
  version: POSSESSION_SELECTION_VERSION,
  pool: "runIndex 0 … poolSize − 1 of the engine's fixed seed policy (seed = hash(providerEventId); draw i uses mulberry32(fnv1a32(seed + ':' + i)))",
  distance: "official-representative@2 distance to the official v0.1 player expectations (team terms withheld for NBA)",
  [POSSESSION_RUN_KIND.DEFAULT]: "smallest distance among runs won by the official Elo favoured side; ties → lowest runIndex",
  [POSSESSION_RUN_KIND.UPSET]: "smallest distance among runs won by the side the official forecast does not favour; ties → lowest runIndex",
  [POSSESSION_RUN_KIND.HIGH]: "total closest to the pool's p90 total (nearest rank); ties → smaller distance → lowest runIndex",
  [POSSESSION_RUN_KIND.LOW]: "total closest to the pool's p10 total (nearest rank); ties → smaller distance → lowest runIndex",
  [POSSESSION_RUN_KIND.OVERTIME]: "smallest distance among overtime runs; ties → lowest runIndex (only when the pool has one)",
  order: "default, upset, high, low, overtime — each pick excludes the runs already picked",
});

/** Kind → the reader-facing title of the run selector chip. */
export const POSSESSION_KIND_TITLE = Object.freeze({
  [POSSESSION_RUN_KIND.DEFAULT]: "Default run",
  [POSSESSION_RUN_KIND.UPSET]: "Upset",
  [POSSESSION_RUN_KIND.HIGH]: "High-scoring",
  [POSSESSION_RUN_KIND.LOW]: "Low-scoring",
  [POSSESSION_RUN_KIND.OVERTIME]: "Overtime",
});

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Nearest-rank quantile (simulate.mjs `quantiles` rule): s[ceil(q·n) − 1]. */
export function nearestRank(values, q) {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return null;
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
}

/**
 * One pool run → the features every rule reads. `lines` = [{ providerAthleteId, ds, pts, reb, ast, threePm }].
 * Families match the official snapshot's v0.1 family names (pts, reb, ast, threePm, pra, ptsReb, ptsAst, minutes).
 */
export function poolFeatures({ runIndex, final, overtimePeriods, lines }, targets) {
  const players = (lines ?? []).map((l) => {
    const minutes = l.ds / 600;
    return { playerId: String(l.providerAthleteId), stats: { minutes, pts: l.pts, reb: l.reb, ast: l.ast, threePm: l.threePm, pra: l.pts + l.reb + l.ast, ptsReb: l.pts + l.reb, ptsAst: l.pts + l.ast } };
  });
  const { distance } = runDistance({ runIndex, home: final[0], away: final[1], players }, targets);
  return { runIndex, home: final[0], away: final[1], total: final[0] + final[1], ot: overtimePeriods, distance: isNum(distance) ? Number(distance.toFixed(6)) : null };
}

const sideOf = (f) => (f.home > f.away ? "HOME" : "AWAY");
const byDistance = (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || a.runIndex - b.runIndex;

/**
 * @param {Array<{runIndex, home, away, total, ot, distance}>} features  poolFeatures() of every pool run
 * @param {"HOME"|"AWAY"|null} officialSide  the official Elo favoured side (snapshot.game.winner.side)
 * @returns {{ picks: Array<{kind, runIndex, rule}>, missing: Array<{kind, reason}>, poolTotals: {p10, p90} }}
 */
export function selectPossessionRuns(features, officialSide) {
  const taken = new Set();
  const picks = [];
  const missing = [];
  const totals = features.map((f) => f.total);
  const p10 = nearestRank(totals, 0.1), p90 = nearestRank(totals, 0.9);
  const free = () => features.filter((f) => !taken.has(f.runIndex));
  const take = (kind, list) => {
    if (!list.length) { missing.push({ kind, reason: "no remaining pool run satisfies the rule" }); return; }
    taken.add(list[0].runIndex);
    picks.push({ kind, runIndex: list[0].runIndex, rule: POSSESSION_SELECTION_RULES[kind] });
  };
  if (officialSide === "HOME" || officialSide === "AWAY") {
    take(POSSESSION_RUN_KIND.DEFAULT, free().filter((f) => sideOf(f) === officialSide).sort(byDistance));
    take(POSSESSION_RUN_KIND.UPSET, free().filter((f) => sideOf(f) !== officialSide).sort(byDistance));
  } else {
    missing.push({ kind: POSSESSION_RUN_KIND.DEFAULT, reason: "no official favoured side: every run is a hypothetical what-if" });
    missing.push({ kind: POSSESSION_RUN_KIND.UPSET, reason: "no official favoured side to upset" });
  }
  const near = (target) => (a, b) => Math.abs(a.total - target) - Math.abs(b.total - target) || byDistance(a, b);
  take(POSSESSION_RUN_KIND.HIGH, free().sort(near(p90)));
  take(POSSESSION_RUN_KIND.LOW, free().sort(near(p10)));
  const ots = free().filter((f) => f.ot > 0).sort(byDistance);
  if (ots.length) take(POSSESSION_RUN_KIND.OVERTIME, ots);
  else missing.push({ kind: POSSESSION_RUN_KIND.OVERTIME, reason: "no overtime run in the pool" });
  return { picks, missing, poolTotals: { p10, p90 } };
}
