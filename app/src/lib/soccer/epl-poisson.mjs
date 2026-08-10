/**
 * EPL independent-Poisson baseline — the PURE fit/predict pair shared by the evaluation script,
 * the replay runner, and the guards (Program 149 · Release 1).
 *
 * Deterministic and closed-form: no clocks, no randomness. "Simulation" here means the exact
 * Poisson score matrix, so identical inputs are identical bytes all the way out.
 *
 * The caller owns chronology: `fitPoisson` sees whatever match list it is given, so the LEAKAGE
 * boundary (fit strictly before the slate) is enforced where the match list is selected — the
 * replay runner refuses rows at/after its cutoff rather than trusting callers to pre-filter.
 */

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];
const pm = (lam, k) => Math.exp(-lam) * Math.pow(lam, k) / FACT[k];

/** Fit per-club attack/defence tallies + league means from FT rows {home, away, ftHome, ftAway}. */
export function fitPoisson(rows) {
  const stats = new Map();
  const st = (c) => { if (!stats.has(c)) stats.set(c, { hf: 0, ha: 0, hg: 0, af: 0, aa: 0, ag: 0 }); return stats.get(c); };
  for (const m of rows) {
    const h = st(m.home), a = st(m.away);
    h.hf += m.ftHome; h.ha += m.ftAway; h.hg += 1;
    a.af += m.ftAway; a.aa += m.ftHome; a.ag += 1;
  }
  const agg = [...stats.values()].reduce((x, s) => ({ hf: x.hf + s.hf, hg: x.hg + s.hg, af: x.af + s.af, ag: x.ag + s.ag }), { hf: 0, hg: 0, af: 0, ag: 0 });
  return {
    stats,
    muH: agg.hg ? agg.hf / agg.hg : 1.5,
    muA: agg.ag ? agg.af / agg.ag : 1.2,
    fitted: rows.length,
  };
}

/** Predict one fixture from a fit. Unseen clubs run at multiplier 1.0 — league average, stated. */
export function predictFixture(fit, home, away) {
  const h = fit.stats.get(home) ?? { hf: 0, ha: 0, hg: 0 };
  const a = fit.stats.get(away) ?? { af: 0, aa: 0, ag: 0 };
  const attH = h.hg ? (h.hf / h.hg) / fit.muH : 1, defH = h.hg ? (h.ha / h.hg) / fit.muA : 1;
  const attA = a.ag ? (a.af / a.ag) / fit.muA : 1, defA = a.ag ? (a.aa / a.ag) / fit.muH : 1;
  const lamH = Math.max(0.05, fit.muH * attH * defA);
  const lamA = Math.max(0.05, fit.muA * attA * defH);
  let pH = 0, pD = 0, pA = 0, over25 = 0;
  const cells = [];
  for (let x = 0; x <= 10; x++) for (let y = 0; y <= 10; y++) {
    const p = pm(lamH, x) * pm(lamA, y);
    cells.push({ score: `${x}-${y}`, p });
    if (x > y) pH += p; else if (x === y) pD += p; else pA += p;
    if (x + y >= 3) over25 += p;
  }
  const z = pH + pD + pA;
  cells.sort((u, v) => v.p - u.p || u.score.localeCompare(v.score));
  return {
    lambdas: { home: lamH, away: lamA },
    threeWay: { H: pH / z, D: pD / z, A: pA / z },
    over25: over25 / z,
    topScorelines: cells.slice(0, 5).map((c) => ({ score: c.score, p: c.p / z })),
    coldStart: { home: h.hg === 0, away: a.ag === 0 },
  };
}
