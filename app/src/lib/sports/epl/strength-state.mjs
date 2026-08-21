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

/**
 * Fold matches strictly before the cutoff into per-club home/away tallies.
 *
 * `halfLifeDays` (P188/v2 research) applies exponential time-decay to each folded match:
 * weight = 0.5 ** (ageDays / halfLifeDays). The tallies become WEIGHTED sums, which is why `hg`/`ag`
 * are counts only in the unweighted case — every downstream ratio already divides by them, so the
 * arithmetic is unchanged in form.
 *
 * DEFAULT IS NULL, meaning every match weighs 1.0 — byte-identical to v1. This parameter exists so
 * the bake-off can measure recency weighting through the SAME lib the live path uses rather than a
 * research fork that could drift from it; it is not enabled anywhere until a variant clears the
 * preregistered bars in preregistration-model-v2.json.
 */
export function fitEplStrength({ rows, cutoffIso, halfLifeDays = null }) {
  const cutoff = Date.parse(cutoffIso ?? "");
  if (!Number.isFinite(cutoff)) throw new Error("fitEplStrength: cutoffIso required");
  if (halfLifeDays != null && !(Number.isFinite(halfLifeDays) && halfLifeDays > 0)) {
    throw new Error("fitEplStrength: halfLifeDays must be a positive number when supplied");
  }
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
    /* w === 1 exactly when no half-life is supplied, so the v1 tallies are reproduced bit for bit. */
    const w = halfLifeDays == null
      ? 1
      : Math.pow(0.5, ((cutoff - Date.parse(m.dateUtc)) / 86_400_000) / halfLifeDays);
    h.hf += w * m.ftHome; h.ha += w * m.ftAway; h.hg += w;
    a.af += w * m.ftAway; a.aa += w * m.ftHome; a.ag += w;
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
export function lambdasFor(state, homeClub, awayClub, { shrinkK = 0 } = {}) {
  const { LAMBDA_FLOOR, COLD_START_MULTIPLIER } = EPL_POISSON_PARAMS;
  const h = state.stats.get(normalizeClubName(homeClub));
  const a = state.stats.get(normalizeClubName(awayClub));
  /*
   * Ridge shrinkage toward the league average, expressed as k pseudo-matches played exactly at that
   * average: (goals + k·mu) / (games + k) / mu. k = 0 cancels to the v1 expression term for term,
   * which is why the default costs nothing. A club with few folded matches is pulled toward 1.0 the
   * hardest, which is the point — three games is not a strength estimate.
   */
  const mult = (goals, games, mu) => (games ? (goals + shrinkK * mu) / (games + shrinkK) / mu : COLD_START_MULTIPLIER);
  const attH = mult(h?.hf, h?.hg, state.muHome);
  const defH = mult(h?.ha, h?.hg, state.muAway);
  const attA = mult(a?.af, a?.ag, state.muAway);
  const defA = mult(a?.aa, a?.ag, state.muHome);
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
export function scoreMatrix(state, homeClub, awayClub, { shrinkK = 0, dixonColesRho = null } = {}) {
  const { MAX_GOALS } = EPL_POISSON_PARAMS;
  const { lamHome, lamAway, coldStart } = lambdasFor(state, homeClub, awayClub, { shrinkK });
  const pm = (lam, k) => Math.exp(-lam) * Math.pow(lam, k) / FACT[k];
  /*
   * Dixon-Coles (1997) low-score dependence. Independent Poisson misprices exactly four cells —
   * 0-0, 0-1, 1-0, 1-1 — because goals in low-scoring matches are not independent. tau reweights
   * only those four; every other cell is untouched, and the grid is renormalised below either way.
   *
   * Clamped at zero: for a large |rho| tau can go negative, and a negative probability is not a
   * model output. Clamping is recorded rather than silently absorbed so a sweep cannot pick a rho
   * that only "wins" by producing impossible cells.
   */
  let dcClamped = 0;
  const tau = (x, y) => {
    if (dixonColesRho == null) return 1;
    const r = dixonColesRho;
    let t = 1;
    if (x === 0 && y === 0) t = 1 - lamHome * lamAway * r;
    else if (x === 0 && y === 1) t = 1 + lamHome * r;
    else if (x === 1 && y === 0) t = 1 + lamAway * r;
    else if (x === 1 && y === 1) t = 1 - r;
    if (t < 0) { dcClamped += 1; return 0; }
    return t;
  };
  const grid = [];
  let z = 0;
  for (let x = 0; x <= MAX_GOALS; x++) {
    grid.push([]);
    for (let y = 0; y <= MAX_GOALS; y++) { const p = pm(lamHome, x) * pm(lamAway, y) * tau(x, y); grid[x].push(p); z += p; }
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

  /*
   * EVERYTHING BELOW IS READ OFF THE SAME NORMALIZED GRID — no second model, no sampling, no new
   * input. These were already implied by the matrix and simply never read out, so the published
   * forecast carried five numbers out of a distribution that answers far more. Each one is an exact
   * sum over grid cells, which is why they reconcile against the 1X2 block by construction rather
   * than approximately.
   */
  let btts = 0, csHome = 0, csAway = 0;
  const marginDist = new Map();               // (home − away) → probability
  const homeGoals = new Array(MAX_GOALS + 1).fill(0);
  const awayGoals = new Array(MAX_GOALS + 1).fill(0);
  for (let x = 0; x <= MAX_GOALS; x++) {
    for (let y = 0; y <= MAX_GOALS; y++) {
      const p = grid[x][y];
      if (x >= 1 && y >= 1) btts += p;
      if (y === 0) csHome += p;               // home keeps a clean sheet ⇔ away scores none
      if (x === 0) csAway += p;
      marginDist.set(x - y, (marginDist.get(x - y) ?? 0) + p);
      homeGoals[x] += p;
      awayGoals[y] += p;
    }
  }
  const r6 = (v) => Number(v.toFixed(6));
  const expectationOf = (dist) => Number(dist.reduce((s, p, k) => s + p * k, 0).toFixed(4));

  /*
   * The line ladder. `cdfAt(k)` is P(total ≤ k), so for a half-goal line L the under side is
   * P(total ≤ ⌊L⌋) — no push is possible on a half line, which is why over + under is exactly 1
   * here and why only half lines are emitted.
   */
  const LINES = [0.5, 1.5, 2.5, 3.5, 4.5];
  const ladder = LINES.map((line) => {
    const under = cdfAt(Math.floor(line));
    return { line, over: r6(1 - under), under: r6(under) };
  });

  return {
    modelId: state.modelId,
    lambdas: { home: Number(lamHome.toFixed(4)), away: Number(lamAway.toFixed(4)) },
    coldStart,
    /* Non-zero only when a Dixon-Coles rho drove a cell negative — a sweep must not hide that. */
    dcClamped,
    oneXTwo: { home: Number(pH.toFixed(6)), draw: Number(pD.toFixed(6)), away: Number(pA.toFixed(6)) },
    reconciliation: Math.abs(pH + pD + pA - 1) < 1e-9,
    totals: {
      expected: Number(totalDist.reduce((s, p, k) => s + p * k, 0).toFixed(4)),
      over25: Number((1 - cdfAt(2)).toFixed(6)),
      under25: Number(cdfAt(2).toFixed(6)),
      quantiles: { p10: quantile(0.1), p25: quantile(0.25), p50: quantile(0.5), p75: quantile(0.75), p90: quantile(0.9) },
      distribution: totalDist.map((p) => Number(p.toFixed(6))),
      ladder,
    },
    /** Each side's own goal distribution — the marginal of the grid, not a separate fit. */
    teamGoals: {
      home: { expected: expectationOf(homeGoals), distribution: homeGoals.map(r6) },
      away: { expected: expectationOf(awayGoals), distribution: awayGoals.map(r6) },
    },
    btts: { yes: r6(btts), no: r6(1 - btts) },
    cleanSheet: { home: r6(csHome), away: r6(csAway) },
    /* Two-of-three outcomes. Each is a sum of 1X2 terms, so they cannot disagree with that block. */
    doubleChance: {
      homeOrDraw: r6(pH + pD),
      drawOrAway: r6(pD + pA),
      homeOrAway: r6(pH + pA),
    },
    margin: {
      expected: Number([...marginDist].reduce((s, [m, p]) => s + m * p, 0).toFixed(4)),
      distribution: [...marginDist].sort((a, b) => a[0] - b[0]).map(([margin, p]) => ({ margin, p: r6(p) })),
    },
    /*
     * Ten rather than five. A correct-score readout that stops at five shows ~40% of the mass on a
     * typical fixture and reads as though the rest is negligible; `topScorelinesMass` states exactly
     * how much of the distribution the list accounts for, so the page can say what it is omitting.
     */
    topScorelines: scores.slice(0, 10).map((s) => ({ ...s, p: r6(s.p) })),
    topScorelinesMass: r6(scores.slice(0, 10).reduce((t, s) => t + s.p, 0)),
  };
}
