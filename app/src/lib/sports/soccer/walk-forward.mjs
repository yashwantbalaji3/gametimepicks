/**
 * League-agnostic walk-forward evaluation (P257 · Phase B). Pure.
 *
 * The protocol is EPL's, unchanged (scripts/epl/evaluate-epl-baselines.mjs, reports/model-v1-evaluation.json):
 *   · walk forward by UTC calendar day; every match on a day is predicted from ONE pregame state fit on
 *     matches dated strictly earlier; the day's results fold in only after the whole slate is predicted
 *   · the warm-up season is folded, never scored
 *   · unseen clubs enter at Elo 1500 and Poisson multipliers 1.0 (league average)
 *
 * Models, each exactly as EPL defines it:
 *   empirical  running league H/D/A frequencies, Laplace +1
 *   elo        K=20, home advantage +60, P(draw) = the running empirical draw rate
 *   poisson    THE LIVE LIBRARY — fitEplStrength + scoreMatrix with their committed defaults (no shrinkage,
 *              no Dixon-Coles, no time decay): the model EPL publishes, applied to another league as is
 *   market     de-vigged market-average closing 1X2 (football-data.co.uk) — a reference, never a model input
 */
import { fitEplStrength, scoreMatrix } from "../epl/strength-state.mjs";

export const OUTCOMES = Object.freeze(["H", "D", "A"]);
export const ELO = Object.freeze({ K: 20, HOME_ADV: 60, START: 1500 });

export function walkForward(rows, { warmupSeason = "2022-23", scoreSeasons = null } = {}) {
  const matches = [...(rows ?? [])]
    .filter((r) => Number.isInteger(r.ftHome) && Number.isInteger(r.ftAway) && r.dateUtc)
    .sort((a, b) => a.dateUtc.localeCompare(b.dateUtc) || String(a.home).localeCompare(String(b.home)));
  const scored = (m) => m.season !== warmupSeason && (!scoreSeasons || scoreSeasons.includes(m.season));
  const tally = { H: 0, D: 0, A: 0 };
  const elo = new Map();
  const getElo = (c) => elo.get(c) ?? ELO.START;
  const preds = [];
  let i = 0;
  while (i < matches.length) {
    const day = matches[i].dateUtc.slice(0, 10);
    const slate = [];
    while (i < matches.length && matches[i].dateUtc.slice(0, 10) === day) slate.push(matches[i++]);
    const state = slate.some(scored) ? fitEplStrength({ rows: matches, cutoffIso: `${day}T00:00:00Z` }) : null;
    for (const m of slate) {
      if (!scored(m)) continue;
      const n = tally.H + tally.D + tally.A;
      const empirical = { H: (tally.H + 1) / (n + 3), D: (tally.D + 1) / (n + 3), A: (tally.A + 1) / (n + 3) };
      const exp = 1 / (1 + Math.pow(10, (getElo(m.away) - (getElo(m.home) + ELO.HOME_ADV)) / 400));
      const eloP = { H: (1 - empirical.D) * exp, D: empirical.D, A: (1 - empirical.D) * (1 - exp) };
      const sm = scoreMatrix(state, m.home, m.away).oneXTwo;
      const c = m.market?.close1x2;
      preds.push({
        season: m.season, dateUtc: m.dateUtc, home: m.home, away: m.away, result: m.result,
        probs: { empirical, elo: eloP, poisson: { H: sm.home, D: sm.draw, A: sm.away }, uniform: { H: 1 / 3, D: 1 / 3, A: 1 / 3 }, market: c ? { H: c.home, D: c.draw, A: c.away } : null },
      });
    }
    for (const m of slate) {
      tally[m.result] += 1;
      const expH = 1 / (1 + Math.pow(10, (getElo(m.away) - (getElo(m.home) + ELO.HOME_ADV)) / 400));
      const score = m.result === "H" ? 1 : m.result === "D" ? 0.5 : 0;
      const eH = getElo(m.home), eA = getElo(m.away);
      elo.set(m.home, eH + ELO.K * (score - expH));
      elo.set(m.away, eA + ELO.K * ((1 - score) - (1 - expH)));
    }
  }
  return preds;
}

const r4 = (x) => Number(x.toFixed(4));

/** logLoss · brier · rps · accuracy · ece (10-bin, over every emitted outcome probability). */
export function scorePredictions(preds, model) {
  const list = preds.filter((p) => p.probs[model]);
  if (!list.length) return { n: 0 };
  let ll = 0, brier = 0, rps = 0, hit = 0;
  const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, o: 0 }));
  for (const r of list) {
    const q = r.probs[model];
    ll += -Math.log(Math.max(1e-12, q[r.result]));
    brier += OUTCOMES.reduce((s, o) => s + (q[o] - (r.result === o ? 1 : 0)) ** 2, 0);
    const cq1 = q.H, cq2 = q.H + q.D, co1 = r.result === "H" ? 1 : 0, co2 = r.result === "A" ? 0 : 1;
    rps += ((cq1 - co1) ** 2 + (cq2 - co2) ** 2) / 2;
    if ([...OUTCOMES].sort((x, y) => q[y] - q[x])[0] === r.result) hit += 1;
    for (const o of OUTCOMES) { const b = bins[Math.min(9, Math.floor(q[o] * 10))]; b.n += 1; b.p += q[o]; b.o += r.result === o ? 1 : 0; }
  }
  const N = list.length * 3;
  const ece = bins.reduce((s, b) => s + (b.n ? (b.n / N) * Math.abs(b.p / b.n - b.o / b.n) : 0), 0);
  return { n: list.length, logLoss: r4(ll / list.length), brier: r4(brier / list.length), rps: r4(rps / list.length), accuracy: r4(hit / list.length), ece: r4(ece) };
}

export function scoreBySeason(preds, model) {
  const seasons = [...new Set(preds.map((p) => p.season))].sort();
  return { overall: scorePredictions(preds, model), bySeason: Object.fromEntries(seasons.map((s) => [s, scorePredictions(preds.filter((p) => p.season === s), model)])) };
}
