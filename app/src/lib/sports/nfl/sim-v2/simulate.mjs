/**
 * NFL SIMULATION V2 — batch runner and anchor calibration (Session 13 · Phase D). Pure (no I/O).
 *
 * runBatch   N coherent games with per-run RNG (run i is reproducible alone), compact per-run arrays, and the
 *            coherence contract checked on EVERY run.
 * calibrate  one tilt θ per offense so the simulated MEAN points equal model-owned anchors (the published margin and
 *            totals heads' implied team means). Common random numbers across iterations; secant steps. The anchors are
 *            the only team-strength input — the engine adds the coherent game path, not a second rating.
 */
import { N_PERIODS, N_PSTAT, N_TSTAT, PSTAT, runRng, simulateGame, tiltedTable } from "./engine.mjs";
import { checkRun } from "./coherence.mjs";

export function runBatch({ compiled, thetas, players = null, baseSeed, runs, postseason = false, check = true, firstRun = 0, passWeight = null }) {
  const tables = [tiltedTable(compiled, thetas[0]), tiltedTable(compiled, thetas[1])];
  const nSlots = players ? [players[0].n, players[1].n] : null;
  const out = {
    team: [new Float64Array(N_TSTAT), new Float64Array(N_TSTAT)],
    period: [new Float64Array(N_PERIODS), new Float64Array(N_PERIODS)],
    players: players ? [new Float64Array((nSlots[0] + 1) * N_PSTAT), new Float64Array((nSlots[1] + 1) * N_PSTAT)] : null,
  };
  const res = {
    runs,
    scores: new Int16Array(runs * 2),
    periods: new Int16Array(runs * 2 * N_PERIODS),
    ot: new Uint8Array(runs),
    team: new Float32Array(runs * 2 * N_TSTAT),
    players: players ? [new Float32Array(runs * (nSlots[0] + 1) * N_PSTAT), new Float32Array(runs * (nSlots[1] + 1) * N_PSTAT)] : null,
    firstTd: new Int32Array(runs * 3).fill(-1),
    failedRuns: 0,
    failureCodes: {},
    nSlots,
  };
  for (let i = 0; i < runs; i++) {
    const rng = runRng(baseSeed, firstRun + i);
    const run = simulateGame({ compiled, tables, players, rng, postseason, out, passWeight });
    res.scores[2 * i] = run.score[0];
    res.scores[2 * i + 1] = run.score[1];
    res.ot[i] = run.ot ? 1 : 0;
    for (let s = 0; s < 2; s++) {
      res.team.set(out.team[s], (i * 2 + s) * N_TSTAT);
      for (let p = 0; p < N_PERIODS; p++) res.periods[(i * 2 + s) * N_PERIODS + p] = out.period[s][p];
      if (players) res.players[s].set(out.players[s], i * (nSlots[s] + 1) * N_PSTAT);
    }
    if (run.firstTd) {
      res.firstTd[3 * i] = run.firstTd.side;
      res.firstTd[3 * i + 1] = run.firstTd.slot;
      res.firstTd[3 * i + 2] = run.firstTd.type === "PASS" ? 0 : run.firstTd.type === "RUSH" ? 1 : 2; // 2 = DEF (MKT-01)
    }
    if (check) {
      const f = checkRun({ team: out.team, period: out.period, players: out.players, slots: nSlots, run });
      if (f.length) {
        res.failedRuns += 1;
        for (const c of f) res.failureCodes[c] = (res.failureCodes[c] ?? 0) + 1;
      }
    }
  }
  return res;
}

const meanPts = (b, side) => {
  let s = 0;
  for (let i = 0; i < b.runs; i++) s += b.scores[2 * i + side];
  return s / b.runs;
};

/**
 * @param anchors { home, away } model-owned expected points
 * @returns { thetas: [home, away], achieved: [home, away], iterations }
 */
export function calibrate({ compiled, anchors, baseSeed, runs = 1500, iterations = 8, tolerance = 0.15, postseason = false }) {
  let th = [0, 0];
  let b = runBatch({ compiled, thetas: th, baseSeed, runs, check: false, postseason });
  let m = [meanPts(b, 0), meanPts(b, 1)];
  let prevTh = null;
  let prevM = null;
  let it = 0;
  for (; it < iterations; it++) {
    const err = [anchors.home - m[0], anchors.away - m[1]];
    if (Math.abs(err[0]) <= tolerance && Math.abs(err[1]) <= tolerance) break;
    const next = [0, 1].map((s) => {
      // Secant once two points exist; otherwise an empirical slope (~11 points per unit θ at league level).
      const slope = prevTh && Math.abs(th[s] - prevTh[s]) > 1e-6 ? (m[s] - prevM[s]) / (th[s] - prevTh[s]) : 11;
      const step = (anchors[s === 0 ? "home" : "away"] - m[s]) / (slope > 1 ? slope : 11);
      return Math.max(-3, Math.min(3, th[s] + Math.max(-0.8, Math.min(0.8, step))));
    });
    prevTh = th;
    prevM = m;
    th = next;
    b = runBatch({ compiled, thetas: th, baseSeed, runs, check: false, postseason });
    m = [meanPts(b, 0), meanPts(b, 1)];
  }
  return { thetas: th, achieved: m, iterations: it };
}

/**
 * QB CONDITIONING (PD decision B, 2026-11-11): per offense, the completion-gain weight w at which the starter's MEAN
 * simulated passing yards equal `targets[side]` (the board's projection mean for that starter; null ⇒ w = 1). The weight
 * draws no randomness, so the runs below share every draw with the anchored batch and the score cannot move; secant
 * steps on common random numbers, w bounded to [0.25, 4] (a target outside that reach is reported, not forced).
 * @returns {{ weights: [number, number], achieved: [number|null, number|null], targets: [number|null, number|null], bounded: [boolean, boolean] }}
 */
export function calibratePassWeights({ compiled, thetas, players, baseSeed, targets, starterSlots, runs = 1500, iterations = 10, tolerance = 1, postseason = false }) {
  const meanPass = (b, side) => {
    const slot = starterSlots[side];
    if (slot == null || slot < 0) return null;
    const stride = (b.nSlots[side] + 1) * N_PSTAT;
    let s = 0;
    for (let i = 0; i < b.runs; i++) s += b.players[side][i * stride + slot * N_PSTAT + PSTAT.passYds];
    return s / b.runs;
  };
  let w = [1, 1];
  let b = runBatch({ compiled, thetas, players, baseSeed, runs, check: false, postseason, passWeight: w });
  let m = [meanPass(b, 0), meanPass(b, 1)];
  let prevW = null, prevM = null;
  for (let it = 0; it < iterations; it++) {
    const done = [0, 1].every((s) => targets[s] == null || m[s] == null || Math.abs(targets[s] - m[s]) <= tolerance);
    if (done) break;
    const next = [0, 1].map((s) => {
      if (targets[s] == null || m[s] == null) return 1;
      const slope = prevW && Math.abs(w[s] - prevW[s]) > 1e-6 && Math.abs(m[s] - prevM[s]) > 1e-6 ? (m[s] - prevM[s]) / (w[s] - prevW[s]) : m[s] / w[s];
      return Math.max(0.25, Math.min(4, w[s] + (targets[s] - m[s]) / (slope > 1e-6 ? slope : m[s] / w[s] || 1)));
    });
    prevW = w; prevM = m; w = next;
    b = runBatch({ compiled, thetas, players, baseSeed, runs, check: false, postseason, passWeight: w });
    m = [meanPass(b, 0), meanPass(b, 1)];
  }
  return { weights: w, achieved: m, targets, bounded: w.map((x) => x <= 0.25 || x >= 4) };
}
