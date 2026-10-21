/**
 * nba-possession-sim-v0 · MANY DRAWS → ONE GAME SUMMARY. PURE, seeded, deterministic.
 * NBA RESEARCH PROTOTYPE · dataClass PRIVATE_RESEARCH · productEligible: false. Not imported by any route, producer,
 * workflow, board or snapshot (possession-sim-boundary.test.mjs scans for that).
 *
 * Every draw is checked by checkPossessionDraw (all invariants incl. log ↔ box reconciliation); a violation THROWS.
 * Player quantiles are over the draws in which the player played (seconds > 0), as in v1; PRA / PA / PR are summed
 * inside each draw (the same draw), never from separately drawn marginals.
 */
import { preparePossessionGame, simulatePossessionDraw } from "./engine.mjs";
import { checkPossessionDraw } from "./invariants.mjs";
import { boxToJson, formatClock } from "./events.mjs";
import { POSSESSION_SIM_VERSION, DATA_CLASS, PRODUCT_ELIGIBLE, POSSESSION_PARAMS } from "./params.mjs";

export const DEFAULT_SIMULATIONS = 1000;
export const PLAYER_STATS = Object.freeze(["min", "pts", "reb", "ast", "threePm", "threePa", "fga", "fta", "oreb", "dreb", "stl", "blk", "tov", "pf"]);
const COMBOS = Object.freeze({ pra: ["pts", "reb", "ast"], ptsAst: ["pts", "ast"], ptsReb: ["pts", "reb"] });
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(2)));
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(4)));

export function quantiles(arr) {
  const n = arr.length;
  if (!n) return { mean: null, sd: null, p10: null, p25: null, p50: null, p75: null, p90: null };
  const s = Float64Array.from(arr).sort();
  const at = (q) => s[Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1))];
  let m = 0; for (let i = 0; i < n; i += 1) m += s[i]; m /= n;
  let ss = 0; for (let i = 0; i < n; i += 1) ss += (s[i] - m) ** 2;
  return { mean: r4(m), sd: n > 1 ? r4(Math.sqrt(ss / (n - 1))) : null, p10: at(0.1), p25: at(0.25), p50: at(0.5), p75: at(0.75), p90: at(0.9) };
}

/** Play-by-play view of a draw (event log with display clock + named players), for research inspection only. */
export function eventLogView(draw, names = new Map()) {
  const nm = (id) => (id == null ? null : { providerAthleteId: String(id), name: names.get(String(id)) ?? null });
  return draw.events.map((e) => ({ ...e, clock: formatClock(e.c), team: e.team == null ? undefined : e.team === 0 ? "home" : "away", poss: e.poss === 0 ? "home" : "away", score: { home: e.s[0], away: e.s[1] }, s: undefined, playerRef: e.player != null ? nm(e.player) : undefined }));
}

/**
 * @param home/away  { name, providerTeamId, side: buildPossessionSide() }
 * @param options.keepSampleRunIndex  replay and return this draw's full event log + box score (research inspection)
 */
export function simulatePossessionGame({ providerEventId, inputAsOf, neutralSite = false, home, away, leagueV1, leagueExt, simulations = DEFAULT_SIMULATIONS, seed = null, params = POSSESSION_PARAMS, keepSampleRunIndex = null, __testMutateDraw = null }) {
  if (!Number.isInteger(simulations) || simulations < 1) throw new Error("simulatePossessionGame: simulations must be a positive integer");
  const prep = preparePossessionGame({ providerEventId, seed, neutralSite, home, away, leagueV1, leagueExt, params });
  const N = simulations;
  const fH = new Int32Array(N), fA = new Int32Array(N), ots = new Int32Array(N);
  const per = prep.sides.map((s) => s.players.map(() => Object.fromEntries(PLAYER_STATS.map((k) => [k, new Float64Array(N)]))));
  const teamAgg = [0, 1].map(() => ({ fga: 0, threePa: 0, fta: 0, oreb: 0, dreb: 0, tov: 0, stl: 0, blk: 0, pf: 0, ast: 0, teamRebounds: 0, possessions: 0, segments: 0 }));
  const notes = { fouledOut: 0, disqualifiedStayed: 0, targetTopUps: 0, lateFouls: 0, subs: 0, events: 0 };
  for (let i = 0; i < N; i += 1) {
    const d = simulatePossessionDraw(prep, i);
    if (__testMutateDraw) __testMutateDraw(d, i); // TEST SEAM ONLY
    const v = checkPossessionDraw(d, prep.rosters);
    if (v.length) throw new Error(`INVARIANT VIOLATION in ${providerEventId} draw ${i}: ${v.slice(0, 5).join("; ")}`);
    fH[i] = d.final[0]; fA[i] = d.final[1]; ots[i] = d.overtimePeriods;
    for (const k of Object.keys(notes)) notes[k] += k === "events" ? d.events.length : d.notes[k];
    for (let t = 0; t < 2; t += 1) {
      let j = 0;
      for (const l of d.box.players[t].values()) {
        const ps = per[t][j];
        ps.min[i] = l.ds / 600;
        for (const k of PLAYER_STATS) if (k !== "min") ps[k][i] = l[k];
        j += 1;
      }
      const T = d.box.team[t], A = teamAgg[t];
      for (const k of ["fga", "threePa", "fta", "oreb", "dreb", "tov", "stl", "blk", "pf", "ast", "teamRebounds"]) A[k] += T[k];
      A.possessions += d.notes.possessions[t]; A.segments += d.notes.segments / 2;
    }
  }
  const margin = new Float64Array(N), total = new Float64Array(N);
  let homeWins = 0, otDraws = 0;
  for (let i = 0; i < N; i += 1) { margin[i] = fH[i] - fA[i]; total[i] = fH[i] + fA[i]; if (fH[i] > fA[i]) homeWins += 1; if (ots[i] > 0) otDraws += 1; }
  const names = new Map([...home.side.players, ...away.side.players].map((p) => [String(p.providerAthleteId), p.name ?? null]));
  const playerOut = (t, side) => side.players.map((p, j) => {
    const ps = per[t][j];
    const idx = []; for (let i = 0; i < N; i += 1) if (ps.min[i] > 0) idx.push(i);
    const cond = (a) => idx.map((i) => a[i]);
    const out = { providerAthleteId: String(p.providerAthleteId), name: p.name ?? null, playRate: r4(idx.length / N), expectedMinutes: idx.length ? r2(cond(ps.min).reduce((a, b) => a + b, 0) / idx.length) : null };
    for (const k of PLAYER_STATS) out[k] = quantiles(cond(ps[k]));
    for (const [k, parts] of Object.entries(COMBOS)) out[k] = quantiles(idx.map((i) => parts.reduce((s, key) => s + ps[key][i], 0)));
    return out;
  });
  let sample = null;
  if (Number.isInteger(keepSampleRunIndex)) {
    const d = simulatePossessionDraw(prep, keepSampleRunIndex);
    if (d.final[0] !== fH[keepSampleRunIndex] || d.final[1] !== fA[keepSampleRunIndex]) throw new Error("sample replay mismatch");
    sample = { runIndex: keepSampleRunIndex, box: boxToJson(d.box), events: eventLogView(d, names) };
  }
  const per1 = (x) => r2(x / N);
  return {
    modelVersion: POSSESSION_SIM_VERSION, dataClass: DATA_CLASS, productEligible: PRODUCT_ELIGIBLE,
    providerEventId: String(providerEventId), inputAsOf: inputAsOf ?? null, simulations: N, seed: prep.seed, seedPolicy: prep.seedPolicy,
    engine: { segmentsPer48: r2(prep.segmentsPer48), meanSegmentSeconds: r2(prep.meanSegmentDs / 10), notes },
    sim: {
      pHome: r4(homeWins / N), pAway: r4(1 - homeWins / N), overtimeRate: r4(otDraws / N),
      home: quantiles(fH), away: quantiles(fA), margin: quantiles(margin), total: quantiles(total),
      team: teamAgg.map((A) => Object.fromEntries(Object.entries(A).map(([k, x]) => [k, per1(x)]))),
    },
    players: { home: playerOut(0, home.side), away: playerOut(1, away.side) },
    invariants: { checkedDraws: N, violations: 0, checker: "checkPossessionDraw P1–P11" },
    sample,
  };
}
