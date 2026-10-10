/**
 * MLB-003 / MLB-004 · DIAGNOSIS: is the player-market failure in the MEAN or in the DISTRIBUTION? (2026-10-10)
 *
 * EXPLORATORY. Every 2026 window of these settled rows was already examined in the baseline audit (and Sep–Oct game
 * outcomes in MLB-002), so nothing here is a holdout result or qualification evidence. It decomposes the existing
 * model's error by holding its PUBLISHED MEAN fixed and changing only how P(over) is derived from it:
 *
 *   A  published        1 − Φ((line − μ)/σ)                  (pipeline/mlb/mlb_model.py:328-333, σ = season pstdev, floored)
 *   B  continuity       P(X ≥ ⌈line⌉) under N(μ, σ) with a 0.5 continuity correction — IDENTICAL to A for the half-point
 *                       lines every one of these markets posts (⌈line⌉ − 0.5 = line), so it is reported only as a check
 *   C  Poisson          P(X ≥ ⌈line⌉), X ~ Poisson(μ)
 *   D  negative binomial P(X ≥ ⌈line⌉), X ~ NB(mean μ, dispersion r); r fitted by maximum likelihood on all EARLIER
 *                       dates only (walk-forward, refit per month), never on the row's own month
 *   M  market           de-vigged board price (both sides, multiplicative)
 *
 * and separately measures whether the MEAN discriminates at all: AUC of (μ − line) for the over/under outcome, beside
 * the market's AUC. A mean with AUC ≈ 0.5 cannot be fixed by any distribution.
 *
 *   (from app/) npx tsx ../docs/research/mlb/mlb-003-004/diagnosis/diagnose-distribution-vs-mean.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mlbFirstPitches, mlbLeansOfRecord } from "../../../../../app/src/lib/results/mlb-leans-of-record.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../../..");
const jsonl = (p) => fs.readFileSync(path.join(REPO, p), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const rows = mlbLeansOfRecord(jsonl("pipeline/validation/mlb_settled_leans.jsonl"), { firstPitches: mlbFirstPitches(jsonl("app/public/data/mlb/results/game-predictions-graded.jsonl")) }).record;

const boards = new Map();
const boardRow = (date, id) => {
  if (!boards.has(date)) {
    let b = null;
    try { b = JSON.parse(fs.readFileSync(path.join(REPO, `app/public/data/mlb/boards/${date}.json`), "utf8")); } catch { b = null; }
    boards.set(date, b ? new Map((b.leans ?? []).map((l) => [l.id, l])) : null);
  }
  return boards.get(date)?.get(id) ?? null;
};
const implied = (o) => (o < 0 ? -o / (-o + 100) : 100 / (o + 100));
const clamp = (p) => Math.min(1 - 1e-6, Math.max(1e-6, p));
const erf = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
const lgamma = (z) => { // Lanczos
  const g = 7; const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1; let x = c[0]; for (let i = 1; i < g + 2; i += 1) x += c[i] / (z + i); const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
};
const poisCdf = (k, mu) => { let s = 0; let term = Math.exp(-mu); for (let i = 0; i <= k; i += 1) { if (i > 0) term *= mu / i; s += term; } return s; };
const nbPmf = (k, mu, r) => Math.exp(lgamma(k + r) - lgamma(r) - lgamma(k + 1) + r * Math.log(r / (r + mu)) + k * Math.log(mu / (r + mu)));
const nbCdf = (k, mu, r) => { let s = 0; for (let i = 0; i <= k; i += 1) s += nbPmf(i, mu, r); return s; };

const decisive = rows.filter((r) => Number.isFinite(r.actual) && Number.isFinite(r.line) && r.actual !== r.line && Number.isFinite(r.projection) && r.projection > 0 && Number.isFinite(r.modelProbOver));
const month = (d) => d.slice(0, 7);

// Fit NB dispersion r by maximum likelihood (grid) on rows of earlier months, per market.
function fitR(train) {
  if (train.length < 200) return null;
  const grid = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 64, 128];
  let best = null;
  for (const r of grid) {
    let ll = 0;
    for (const x of train) ll += Math.log(Math.max(1e-12, nbPmf(Math.round(x.actual), x.projection, r)));
    if (!best || ll > best.ll) best = { r, ll };
  }
  return best.r;
}
function auc(scores, ys) {
  const pos = []; const neg = [];
  scores.forEach((s, i) => (ys[i] ? pos : neg).push(s));
  if (!pos.length || !neg.length) return null;
  const all = scores.map((s, i) => ({ s, y: ys[i] })).sort((a, b) => a.s - b.s);
  let rank = 0; let sumPos = 0; let i = 0;
  while (i < all.length) { let j = i; while (j < all.length && all[j].s === all[i].s) j += 1; const avg = (i + j + 1) / 2; for (let k = i; k < j; k += 1) if (all[k].y) sumPos += avg; rank = j; i = j; }
  return (sumPos - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length);
}
const ll = (p, y) => -Math.log(y ? clamp(p) : 1 - clamp(p));
const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);

const out = {};
for (const market of [...new Set(decisive.map((r) => r.marketKey))].sort()) {
  const rs = decisive.filter((r) => r.marketKey === market).sort((a, b) => a.date.localeCompare(b.date));
  const months = [...new Set(rs.map((r) => month(r.date)))].sort();
  const res = { A: [], B: [], C: [], D: [], M: [], y: [], diff: [], mkt: [], rByMonth: {} };
  for (const m of months) {
    const r = fitR(rs.filter((x) => month(x.date) < m));
    res.rByMonth[m] = r;
    for (const x of rs.filter((q) => month(q.date) === m)) {
      if (r == null) continue; // first month: no earlier data to fit D on — scored only where every arm exists
      const y = x.actual > x.line ? 1 : 0;
      const k = Math.ceil(x.line) - 1; // P(X >= ceil(line)) = 1 - CDF(ceil(line) - 1)
      // Recover the published sigma from the published probability (A is exactly the published number).
      const pA = x.modelProbOver;
      const zA = (() => { // invert Φ: z with 1 − Φ(z) = pA
        let lo = -10; let hi = 10; for (let it = 0; it < 80; it += 1) { const mid = (lo + hi) / 2; if (1 - Phi(mid) > pA) lo = mid; else hi = mid; } return (lo + hi) / 2;
      })();
      const sig = zA !== 0 ? (x.line - x.projection) / zA : null;
      const pB = sig && sig > 0 ? 1 - Phi((Math.ceil(x.line) - 0.5 - x.projection) / sig) : pA;
      const pC = 1 - poisCdf(k, x.projection);
      const pD = 1 - nbCdf(k, x.projection, r);
      const b = boardRow(x.date, x.id);
      if (!b || !Number.isFinite(b.oddsOver) || !Number.isFinite(b.oddsUnder) || b.projection !== x.projection) continue;
      const io = implied(b.oddsOver); const iu = implied(b.oddsUnder);
      res.A.push(ll(pA, y)); res.B.push(ll(pB, y)); res.C.push(ll(pC, y)); res.D.push(ll(pD, y)); res.M.push(ll(io / (io + iu), y)); res.y.push(y);
      res.diff.push(x.projection - x.line); res.mkt.push(io / (io + iu));
    }
  }
  out[market] = {
    n: res.y.length,
    logLoss: { A_published: mean(res.A), B_continuity: mean(res.B), C_poisson: mean(res.C), D_negbin_walkforward: mean(res.D), M_market: mean(res.M) },
    coin: Math.LN2,
    discrimination: { aucMeanMinusLine: auc(res.diff, res.y), aucMarket: auc(res.mkt, res.y) },
    nbDispersionByMonth: res.rByMonth,
    note: "first month excluded for every arm (no earlier data to fit D); market restricted to the same-projection board row",
  };
}
fs.mkdirSync(HERE, { recursive: true });
fs.writeFileSync(path.join(HERE, "diagnosis-summary.json"), JSON.stringify({ schema: "gtp.mlb.player-market-diagnosis@1", exploratory: true, out }, null, 1) + "\n");
const f4 = (v) => (v == null ? "—" : v.toFixed(4));
for (const [m, o] of Object.entries(out)) {
  const L = o.logLoss;
  console.log(`${m.padEnd(24)} n=${o.n}  A ${f4(L.A_published)}  B ${f4(L.B_continuity)}  C ${f4(L.C_poisson)}  D ${f4(L.D_negbin_walkforward)}  M ${f4(L.M_market)}  | AUC mean−line ${f4(o.discrimination.aucMeanMinusLine)} vs market ${f4(o.discrimination.aucMarket)} | r ${JSON.stringify(o.nbDispersionByMonth)}`);
}
