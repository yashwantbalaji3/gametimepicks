/**
 * NFL SIMULATION V2 — batch runner and anchor calibration (Session 13 · Phase D). Pure (no I/O).
 *
 * runBatch   N coherent games with per-run RNG (run i is reproducible alone), compact per-run arrays, and the
 *            coherence contract checked on EVERY run.
 * calibrate  one tilt θ per offense so the simulated MEAN points equal model-owned anchors (the published margin and
 *            totals heads' implied team means). Common random numbers across iterations; secant steps. The anchors are
 *            the only team-strength input — the engine adds the coherent game path, not a second rating.
 */
import { N_PERIODS, N_PSTAT, N_TSTAT, runRng, simulateGame, tiltedTable } from "./engine.mjs";
import { checkRun } from "./coherence.mjs";

export function runBatch({ compiled, thetas, players = null, baseSeed, runs, postseason = false, check = true, firstRun = 0 }) {
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
    const run = simulateGame({ compiled, tables, players, rng, postseason, out });
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
      res.firstTd[3 * i + 2] = run.firstTd.type === "PASS" ? 0 : 1;
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

/*
 * NS-1 · ANCHOR TO THE VALIDATED HEADS (architecture audit §8A, founder F-5 YES · 2026-10-07). SHADOW.
 *
 * calibrate() above matches each team's mean points to the forecast's ROUNDED margin and total medians, which come
 * from the margin head, so the simulated winner can sit 5–13 pp away from the published, held-out-tested win head.
 * calibrateToHeads() instead solves the same two tilts against the two validated numbers themselves:
 *
 *   P(home wins | the game is decided) = the forecast's win head (unrounded)
 *   mean total points                   = the totals head's unrounded mean
 *
 * Two unknowns, two targets. Solved in (u, v) = (θh + θa, θh − θa) — u mostly moves the total, v mostly the winner —
 * with a finite-difference Jacobian then Broyden updates, on common random numbers. It solves on the FULL batch
 * WITH players (player allocation draws randoms, so a player-less batch is a different set of games): the batch the
 * receipt reports is the last batch the solver evaluated, so "achieved" is exact for the published runs, not an
 * estimate from a smaller pilot. If it cannot reach both tolerances it says ANCHOR_UNSOLVED and the caller ships
 * no anchored winner (audit II.0 #5) — never a nearest miss presented as anchored.
 */
export const HEAD_ANCHOR_METHOD = "nfl-sim-v2-head-anchor-v1";
export const HEAD_ANCHOR_TOLERANCE = Object.freeze({ pHome: 0.005, total: 0.3 });

/** Win and total moments of a batch: P(home | decided), tie share, mean total, mean points per side. */
export function batchMoments(b) {
  let hw = 0;
  let aw = 0;
  let tot = 0;
  let h = 0;
  for (let i = 0; i < b.runs; i++) {
    const s0 = b.scores[2 * i];
    const s1 = b.scores[2 * i + 1];
    if (s0 > s1) hw += 1; else if (s1 > s0) aw += 1;
    tot += s0 + s1;
    h += s0;
  }
  const decided = hw + aw;
  return {
    pHomeDecided: decided ? hw / decided : null,
    pHome: hw / b.runs,
    tie: (b.runs - decided) / b.runs,
    meanTotal: tot / b.runs,
    meanPts: [h / b.runs, (tot - h) / b.runs],
  };
}

/**
 * @param targets  { pHome: P(home | decided) from the win head, total: the totals head's mean }
 * @param start    starting tilts (e.g. calibrate() on the median anchors); [0, 0] otherwise
 * @returns {{ state: "ANCHORED"|"ANCHOR_UNSOLVED", thetas, achieved, batch, iterations, evaluations, reason? }}
 */
export function calibrateToHeads({ compiled, players = null, targets, baseSeed, runs = 10000, postseason = false, start = [0, 0], tolerance = HEAD_ANCHOR_TOLERANCE, maxIterations = 12 }) {
  if (!(targets?.pHome > 0 && targets.pHome < 1) || !(targets?.total > 0)) {
    return { state: "ANCHOR_UNSOLVED", reason: "targets missing or outside (0, 1) / (0, ∞)", thetas: null, achieved: null, batch: null, iterations: 0, evaluations: 0 };
  }
  const logit = (p) => Math.log(p / (1 - p));
  const clampP = (p) => Math.min(1 - 1e-4, Math.max(1e-4, p));
  let evaluations = 0;
  // Residuals in (logit win, total) space: logit keeps the win equation near-linear in v across favourites.
  const evalAt = (uv) => {
    const th = [(uv[0] + uv[1]) / 2, (uv[0] - uv[1]) / 2].map((t) => Math.max(-3, Math.min(3, t)));
    const batch = runBatch({ compiled, thetas: th, players, baseSeed, runs, postseason, check: false });
    evaluations += 1;
    const m = batchMoments(batch);
    const f = [logit(clampP(m.pHomeDecided ?? 0.5)) - logit(targets.pHome), m.meanTotal - targets.total];
    return { th, batch, m, f };
  };
  const within = (m) => Math.abs((m.pHomeDecided ?? -1) - targets.pHome) <= tolerance.pHome && Math.abs(m.meanTotal - targets.total) <= tolerance.total;

  let x = [start[0] + start[1], start[0] - start[1]];
  let cur = evalAt(x);
  let best = cur;
  const score = (e) => Math.abs((e.m.pHomeDecided ?? -1) - targets.pHome) / tolerance.pHome + Math.abs(e.m.meanTotal - targets.total) / tolerance.total;
  // Jacobian by forward differences (h = 0.1 in each coordinate), then Broyden rank-one updates.
  const H = 0.1;
  const eu = evalAt([x[0] + H, x[1]]);
  const ev = evalAt([x[0], x[1] + H]);
  let J = [[(eu.f[0] - cur.f[0]) / H, (ev.f[0] - cur.f[0]) / H], [(eu.f[1] - cur.f[1]) / H, (ev.f[1] - cur.f[1]) / H]];
  for (const e of [eu, ev]) if (score(e) < score(best)) best = e;
  let it = 0;
  for (; it < maxIterations && !within(cur.m); it++) {
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    if (!Number.isFinite(det) || Math.abs(det) < 1e-9) break;
    let dx = [(-J[1][1] * cur.f[0] + J[0][1] * cur.f[1]) / det, (J[1][0] * cur.f[0] - J[0][0] * cur.f[1]) / det];
    const len = Math.hypot(dx[0], dx[1]);
    if (len > 0.8) dx = dx.map((d) => (d * 0.8) / len);
    const nx = [x[0] + dx[0], x[1] + dx[1]];
    const nxt = evalAt(nx);
    const df = [nxt.f[0] - cur.f[0], nxt.f[1] - cur.f[1]];
    const dd = dx[0] * dx[0] + dx[1] * dx[1];
    if (dd > 1e-12) {
      const r = [df[0] - (J[0][0] * dx[0] + J[0][1] * dx[1]), df[1] - (J[1][0] * dx[0] + J[1][1] * dx[1])];
      J = [[J[0][0] + (r[0] * dx[0]) / dd, J[0][1] + (r[0] * dx[1]) / dd], [J[1][0] + (r[1] * dx[0]) / dd, J[1][1] + (r[1] * dx[1]) / dd]];
    }
    x = nx;
    cur = nxt;
    if (score(cur) < score(best)) best = cur;
  }
  const solved = within(best.m);
  return {
    state: solved ? "ANCHORED" : "ANCHOR_UNSOLVED",
    ...(solved ? {} : { reason: `no tilt pair reached |ΔP(home|decided)| ≤ ${tolerance.pHome} and |Δtotal| ≤ ${tolerance.total} in ${it} iterations` }),
    thetas: best.th,
    achieved: { pHomeDecided: best.m.pHomeDecided, pHome: best.m.pHome, tie: best.m.tie, meanTotal: best.m.meanTotal, meanPts: best.m.meanPts },
    batch: best.batch,
    iterations: it,
    evaluations,
  };
}
