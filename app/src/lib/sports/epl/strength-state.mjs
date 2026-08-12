/**
 * EPL team-strength state + Poisson score model (Program 167 · Release G). PRIVATE.
 *
 * EXACTLY the committed baseline's arithmetic (scripts/epl/evaluate-epl-baselines.mjs `poisson`,
 * evaluated at n=1140: logLoss 1.0017 / brier 0.5968 / acc 0.5158) promoted to a pure, importable
 * state builder so the live shadow path and the historical evaluation can never disagree:
 *
 *   - per-club attack/defence multipliers over league home/away goal means, HOME/AWAY SPLIT
 *     (home advantage is carried by the split means, not a separate parameter)
 *   - unseen clubs = 1.0 multipliers (league average) — the promoted-team cold start rule
 *   - independent-Poisson exact-score grid 0..10 with tail mass renormalized; λ floor 0.05
 *
 * METHOD ALTERNATIVES CONSIDERED AND DEFERRED (the model card records the same list): time-decay
 * weighting, ridge shrinkage toward 1.0, and the Dixon–Coles low-score τ adjustment. Each would
 * create a NEW model requiring its own replay before it may touch the live path; v1 ships the
 * arithmetic whose evaluation receipt already exists. Stopping rule: revisit only with a fresh
 * chronological replay showing material log-loss improvement on a season the change never saw.
 *
 * LEAKAGE RULE, structural: the state at cutoff T folds matches with dateUtc < T only; rows
 * missing integer FT scores are REFUSED (quarantined by the caller's corpus build, re-checked
 * here). The draw is a first-class outcome of the matrix — nothing here can emit a binary read.
 */

export const EPL_STRENGTH_VERSION = 1;
export const EPL_MODEL_ID = "epl-model-v1-split-poisson";
export const EPL_POISSON_PARAMS = Object.freeze({ MAX_GOALS: 10, LAMBDA_FLOOR: 0.05, COLD_START_MULTIPLIER: 1.0 });

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];

export const normalizeClubName = (n) => String(n ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** Fold matches strictly before the cutoff into per-club home/away tallies. */
export function fitEplStrength({ rows, cutoffIso }) {
  const cutoff = Date.parse(cutoffIso ?? "");
  if (!Number.isFinite(cutoff)) throw new Error("fitEplStrength: cutoffIso required");
  const stats = new Map(); // normalized club → { hf,ha,hg, af,aa,ag }
  const names = new Map(); // normalized → display
  const st = (c) => { if (!stats.has(c)) stats.set(c, { hf: 0, ha: 0, hg: 0, af: 0, aa: 0, ag: 0 }); return stats.get(c); };
  let folded = 0;
  const eligible = (rows ?? [])
    .filter((m) => Number.isInteger(m.ftHome) && Number.isInteger(m.ftAway))
    .filter((m) => Number.isFinite(Date.parse(m.dateUtc ?? "")) && Date.parse(m.dateUtc) < cutoff)
    .sort((a, b) => String(a.dateUtc).localeCompare(String(b.dateUtc)));
  for (const m of eligible) {
    const home = normalizeClubName(m.home);
    const away = normalizeClubName(m.away);
    if (!home || !away) continue;
    names.set(home, m.home); names.set(away, m.away);
    const h = st(home), a = st(away);
    h.hf += m.ftHome; h.ha += m.ftAway; h.hg += 1;
    a.af += m.ftAway; a.aa += m.ftHome; a.ag += 1;
    folded += 1;
  }
  const agg = [...stats.values()].reduce((x, s) => ({ hf: x.hf + s.hf, hg: x.hg + s.hg, af: x.af + s.af, ag: x.ag + s.ag }), { hf: 0, hg: 0, af: 0, ag: 0 });
  return {
    version: EPL_STRENGTH_VERSION,
    modelId: EPL_MODEL_ID,
    cutoffIso,
    matchesFitted: folded,
    muHome: agg.hg ? agg.hf / agg.hg : 1.5,
    muAway: agg.ag ? agg.af / agg.ag : 1.2,
    stats,
    knownClubs: new Set(stats.keys()),
    displayName: (c) => names.get(c) ?? c,
  };
}

/** λ pair for one fixture under the state. Cold-start clubs use 1.0 multipliers, stated. */
export function lambdasFor(state, homeClub, awayClub) {
  const { LAMBDA_FLOOR, COLD_START_MULTIPLIER } = EPL_POISSON_PARAMS;
  const h = state.stats.get(normalizeClubName(homeClub));
  const a = state.stats.get(normalizeClubName(awayClub));
  const attH = h?.hg ? (h.hf / h.hg) / state.muHome : COLD_START_MULTIPLIER;
  const defH = h?.hg ? (h.ha / h.hg) / state.muAway : COLD_START_MULTIPLIER;
  const attA = a?.ag ? (a.af / a.ag) / state.muAway : COLD_START_MULTIPLIER;
  const defA = a?.ag ? (a.aa / a.ag) / state.muHome : COLD_START_MULTIPLIER;
  return {
    lamHome: Math.max(LAMBDA_FLOOR, state.muHome * attH * defA),
    lamAway: Math.max(LAMBDA_FLOOR, state.muAway * attA * defH),
    coldStart: { home: !h?.hg, away: !a?.ag },
  };
}

/**
 * The normalized exact-score matrix and everything derived from it. Probabilities reconcile to 1
 * by construction (tail renormalization); the caller may assert `reconciliation` anyway.
 */
export function scoreMatrix(state, homeClub, awayClub) {
  const { MAX_GOALS } = EPL_POISSON_PARAMS;
  const { lamHome, lamAway, coldStart } = lambdasFor(state, homeClub, awayClub);
  const pm = (lam, k) => Math.exp(-lam) * Math.pow(lam, k) / FACT[k];
  const grid = [];
  let z = 0;
  for (let x = 0; x <= MAX_GOALS; x++) {
    grid.push([]);
    for (let y = 0; y <= MAX_GOALS; y++) { const p = pm(lamHome, x) * pm(lamAway, y); grid[x].push(p); z += p; }
  }
  for (let x = 0; x <= MAX_GOALS; x++) for (let y = 0; y <= MAX_GOALS; y++) grid[x][y] /= z;

  let pH = 0, pD = 0, pA = 0;
  const totalDist = new Array(2 * MAX_GOALS + 1).fill(0);
  for (let x = 0; x <= MAX_GOALS; x++) for (let y = 0; y <= MAX_GOALS; y++) {
    if (x > y) pH += grid[x][y]; else if (x === y) pD += grid[x][y]; else pA += grid[x][y];
    totalDist[x + y] += grid[x][y];
  }
  const cdfAt = (k) => totalDist.slice(0, k + 1).reduce((s, p) => s + p, 0);
  const quantile = (q) => { let c = 0; for (let k = 0; k < totalDist.length; k++) { c += totalDist[k]; if (c >= q) return k; } return totalDist.length - 1; };
  const scores = [];
  for (let x = 0; x <= MAX_GOALS; x++) for (let y = 0; y <= MAX_GOALS; y++) scores.push({ score: `${x}-${y}`, p: grid[x][y] });
  scores.sort((a, b) => b.p - a.p);

  return {
    modelId: state.modelId,
    lambdas: { home: Number(lamHome.toFixed(4)), away: Number(lamAway.toFixed(4)) },
    coldStart,
    oneXTwo: { home: Number(pH.toFixed(6)), draw: Number(pD.toFixed(6)), away: Number(pA.toFixed(6)) },
    reconciliation: Math.abs(pH + pD + pA - 1) < 1e-9,
    totals: {
      expected: Number(totalDist.reduce((s, p, k) => s + p * k, 0).toFixed(4)),
      over25: Number((1 - cdfAt(2)).toFixed(6)),
      under25: Number(cdfAt(2).toFixed(6)),
      quantiles: { p10: quantile(0.1), p25: quantile(0.25), p50: quantile(0.5), p75: quantile(0.75), p90: quantile(0.9) },
      distribution: totalDist.map((p) => Number(p.toFixed(6))),
    },
    topScorelines: scores.slice(0, 5).map((s) => ({ ...s, p: Number(s.p.toFixed(6)) })),
  };
}
