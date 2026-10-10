#!/usr/bin/env node
/**
 * MLB-005 · mlb-coherent-worlds-v1 (PREREGISTRATION.md in this directory). A copy of the frozen MLB-003/004 replay
 * (docs/research/mlb/mlb-003-004/replay/replay.mjs at d170c425d1) with ONE addition: for every game scored, the
 * full-game engine (official rules) simulates the game from the same pregame state, fed the v2 per-PA rates and the v2
 * starter workload, and every batter's and starter's count distribution is READ OUT of those simulated games.
 *
 *   npx tsx docs/research/mlb/mlb-005/coherence-v1/run-coherence.mjs --season 2024 [--worlds 2000]   development
 *   npx tsx docs/research/mlb/mlb-005/coherence-v1/run-coherence.mjs --season 2026 --worlds 200      debugging only
 *
 * 2025 is refused: its single retrospective read is spent. The copied replay code must reproduce the frozen 2024
 * replay's numbers exactly (fidelity check) before any engine read-out is reported.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SeededRng } from "../../../../../app/src/lib/game-simulations/rng.ts";
import { DEFAULT_ENGINE_PARAMS, OFFICIAL_RULES_2026, automaticRunnerApplies, simulateGame } from "../../../../../app/src/lib/mlb/full-game/engine.ts";
import { checkWorld } from "../../../../../app/src/lib/mlb/full-game/world-invariants.mjs";
import { mlbFirstPitches, mlbLeansOfRecord } from "../../../../../app/src/lib/results/mlb-leans-of-record.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../../..");
const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };
const SEASON = arg("--season");
const HOLDOUT = false;
if (!/^\d{4}$/.test(SEASON ?? "")) { console.error("REFUSED: --season YYYY required"); process.exit(2); }
if (SEASON === "2025") { console.error("REFUSED: 2025 is the spent RETROSPECTIVE_HOLDOUT; it is not reused for development"); process.exit(2); }
const ENG_WORLDS = Number(arg("--worlds") ?? 2000);
const SUBST = process.argv.includes("--substitution");
// Exploratory analyses (labelled in the output): posted-line comparison where settled leans exist (2026 only), and an
// error decomposition (opportunity vs rate vs distribution). Neither changes any registered result.
const LINES = process.argv.includes("--lines");
const KV3 = process.argv.includes("--k-v3");
const B2CHECK = process.argv.includes("--b2-check"); // exploratory: the forward-B2 engine (substitution + v3 workload), needs --k-v3
const HFA = process.argv.includes("--hfa"); // mlb-coherent-worlds-v3 (PREREGISTRATION-V3-HOME-FIELD.md); implies the v2 substitution engine
const hfaTot = { home: { pa: 0, k: 0, bb: 0, hr: 0, h: 0 }, away: { pa: 0, k: 0, bb: 0, hr: 0, h: 0 } };
const hfaMult = (side) => { const a = hfaTot[side]; const o = hfaTot[side === "home" ? "away" : "home"]; const all = { pa: a.pa + o.pa }; const out = {}; for (const k of ["k", "bb", "hr", "h"]) { const rAll = all.pa ? (a[k] + o[k]) / all.pa : 0; out[k] = rAll > 0 ? ((a[k] + 20000 * rAll) / (a.pa + 20000)) / rAll : 1; } return out; };
const applyMult = (q, m) => { const x = { strikeout: q.strikeout * m.k, walk: q.walk * m.bb, homeRun: q.homeRun * m.hr, single: q.single * m.h, double: q.double * m.h, triple: q.triple * m.h, reachOnError: 0 }; const tot = Object.values(x).reduce((a, b) => a + b, 0); return { ...x, fieldOut: Math.max(0, 1 - tot) }; }; // mlb-k-workload-v3 (docs/research/mlb/mlb-004/k-workload-v3/PREREGISTRATION.md)
const V3 = { prior: 30, minFloor: 3 };
const residuals3 = []; // actual BF − E_v3[BF], every earlier start (v3)
const v3Train = []; // { month, sit, resid2 } — resid2 = actual BF − E_v2[BF]
const v3Delta = {}; // month -> { situation -> δ }
const dayNum = (d) => Date.parse(`${d}T12:00:00Z`) / 86400e3;
const situationOf = (meta, D) => {
  const starts = meta.filter((x) => x.started); const prev = meta[meta.length - 1];
  const last5 = starts.slice(-5).map((x) => x.bf); const rest = prev ? dayNum(D) - dayNum(prev.date) : null;
  if (starts.length >= 3 && last5.reduce((a, b) => a + b, 0) / last5.length < 12) return "OPENER_HISTORY";
  if (prev && !prev.started) return "RELIEF_TO_START";
  if (rest != null && rest < 4) return "SHORT_REST";
  if (starts.length <= 2) return "FIRST_STARTS";
  if (rest != null && rest >= 30) return "LONG_LAYOFF";
  return "NORMAL";
};
const fitV3 = (m) => { const out = {}; for (const sit of ["OPENER_HISTORY", "RELIEF_TO_START", "SHORT_REST", "FIRST_STARTS", "LONG_LAYOFF", "NORMAL"]) { const tr = v3Train.filter((x) => x.month < m && x.sit === sit); out[sit] = tr.reduce((a, x) => a + x.resid2, 0) / (tr.length + V3.prior); } return out; };
const bfPmf3 = (e) => { if (residuals3.length < V2.minResiduals) return null; const o = new Array(V2.bfMax + 1).fill(0); for (const r of residuals3) o[Math.min(V2.bfMax, Math.max(1, Math.round(e + r)))] += 1; return o.map((x) => x / residuals3.length); };
const DECOMPOSE = process.argv.includes("--decompose"); // mlb-coherent-worlds-v2 (PREREGISTRATION-V2-SUBSTITUTION.md)
const DIR = SEASON === "2026" ? path.join(REPO, "data/internal/mlb/boxscore-outcomes") : path.join(REPO, "data/internal/mlb/boxscore-outcomes-history", SEASON);
const HANDS_FILE = path.join(REPO, "data/internal/mlb/boxscore-outcomes-history/people-handedness.json");
const SCORE_FROM = `${SEASON}-05-01`;

// ── registered constants (REPLAY-PROTOCOL.md; v1 constants as in their preregistrations) ───────────────────────────
const K1 = { leagueStarterBF: 22, bfPriorStarts: 3, lastStarts: 5, pitcherPriorBF: 150, lineupPriorPA: 300, lineupGames: 15 };
const B1 = { pa: { mean: 4.0, games: 5, last: 15 }, h: 150, d: 300, t: 800, hr: 170, r: 200, rbi: 200, k: 60, bb: 120 };
const V2 = {
  kKappaGrid: [25, 50, 100, 200, 400, Infinity], minResiduals: 200, bfMax: 45,
  starterPrior: { k: 70, bb: 170, hr: 500 }, penPriorBF: 600, maxStarterShare: 0.9,
  hitKappaGrid: [3, 5, 10, 20, 40, 80, Infinity], mPoints: [0.1, 0.3, 0.5, 0.7, 0.9],
  runMultPrior: 30, oppRunsPriorGames: 20, handLineupGames: 30, handLineupPriorPA: 150, handBatterPriorPA: 120,
};
const CURRENT = { kMin: 3, kSigmaFloor: 1.6, bMin: 5, floors: { hits: 0.85, tb: 1.1, hrr: 1.2 } };
const THRESHOLDS = { k: [3.5, 4.5, 5.5, 6.5], hits: [0.5, 1.5], tb: [1.5, 2.5], hrr: [1.5, 2.5], hr: [0.5], r: [0.5], rbi: [0.5] };
const MAIN = { k: 4.5, hits: 0.5, tb: 1.5, hrr: 1.5, hr: 0.5, r: 0.5, rbi: 0.5 };
const SUPPORT = { k: 21, hits: 7, tb: 17, hrr: 17, hr: 5, r: 6, rbi: 9 };

// ── math ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const lgamma = (z) => { const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]; if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z); z -= 1; let x = c[0]; for (let i = 1; i < 9; i += 1) x += c[i] / (z + i); const t = z + 7.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x); };
const erf = (x) => { const s = Math.sign(x); const a = Math.abs(x); const t = 1 / (1 + 0.3275911 * a); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a); return s * y; };
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
const shrink = (x, n, prior, l) => (x + prior * l) / (n + prior);
const log5 = (b, p, l) => { const c = (v) => Math.min(1 - 1e-4, Math.max(1e-4, v)); const B = c(b); const Q = c(p); const L = c(l); const num = (B * Q) / L; return num / (num + ((1 - B) * (1 - Q)) / (1 - L)); };
const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
const pstdev = (v) => { const m = mean(v); return Math.sqrt(mean(v.map((x) => (x - m) ** 2))); };
const nbPmf = (k, mu, r) => Math.exp(lgamma(k + r) - lgamma(r) - lgamma(k + 1) + r * Math.log(r / (r + mu)) + k * Math.log(Math.max(1e-300, mu) / (r + mu)));
const lchoose = (n, k) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
const betaBinom = (n, p, kappa) => {
  const out = new Array(n + 1).fill(0);
  if (!Number.isFinite(kappa)) { for (let k = 0; k <= n; k += 1) out[k] = Math.exp(lchoose(n, k) + k * Math.log(Math.max(1e-300, p)) + (n - k) * Math.log(Math.max(1e-300, 1 - p))); return out; }
  const a = kappa * p; const b = kappa * (1 - p); const lb = lgamma(a) + lgamma(b) - lgamma(a + b);
  for (let k = 0; k <= n; k += 1) out[k] = Math.exp(lchoose(n, k) + lgamma(k + a) + lgamma(n - k + b) - lgamma(n + a + b) - lb);
  return out;
};
/** Fixed-length pmf: the last cell holds the upper tail. */
const fit = (pmf, len) => { const o = new Array(len).fill(0); pmf.forEach((p, k) => { o[Math.min(k, len - 1)] += p; }); const s = o.reduce((a, b) => a + b, 0); return s > 0 ? o.map((p) => p / s) : o; };
const conv = (a, b, len) => { const o = new Array(len).fill(0); for (let i = 0; i < a.length; i += 1) if (a[i]) for (let j = 0; j < b.length; j += 1) o[Math.min(i + j, len - 1)] += a[i] * b[j]; return o; };
const convPow = (a, n, len) => { let o = [1]; for (let i = 0; i < n; i += 1) o = conv(o, a, len); return fit(o, len); };
/** Σ_n w_n · a^{*n}, building the powers incrementally. */
const mixPowers = (a, weights, len) => { const o = new Array(len).fill(0); let pw = [1]; weights.forEach((w, n) => { if (n > 0) pw = conv(pw, a, len); if (w) pw.forEach((q, k) => { o[k] += w * q; }); }); return o; };
const mix = (parts, len) => { const o = new Array(len).fill(0); for (const [w, pmf] of parts) for (let k = 0; k < pmf.length; k += 1) o[Math.min(k, len - 1)] += w * pmf[k]; return o; };
const poisson = (lam, len) => { const o = new Array(len).fill(0); let p = Math.exp(-lam); for (let k = 0; k < len; k += 1) { o[k] = p; p *= lam / (k + 1); } o[len - 1] += Math.max(0, 1 - o.reduce((a, b) => a + b, 0)); return o; };
const normalCountPmf = (mu, sigma, len) => { const o = new Array(len).fill(0); let prev = 0; for (let k = 0; k < len; k += 1) { const c = k === len - 1 ? 1 : Phi((k + 0.5 - mu) / sigma); o[k] = c - prev; prev = c; } return o; };
const zOf = (q) => { // inverse standard normal (Acklam), enough for five fixed quantiles
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]; const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]; const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]; const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  if (q < 0.02425) { const t = Math.sqrt(-2 * Math.log(q)); return (((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1); }
  if (q > 1 - 0.02425) return -zOf(1 - q);
  const t = q - 0.5; const r = t * t; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * t / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
};
/** Five equiprobable multipliers with mean ≈ 1 from Gamma(κ, κ) (Wilson–Hilferty), renormalized to mean exactly 1. */
const gammaPoints = (kappa) => { if (!Number.isFinite(kappa)) return [1]; const m = V2.mPoints.map((q) => Math.max(0.05, (1 - 1 / (9 * kappa) + zOf(q) * Math.sqrt(1 / (9 * kappa))) ** 3)); const s = mean(m); return m.map((x) => x / s); };

// ── data ────────────────────────────────────────────────────────────────────────────────────────────────────────────
if (!fs.existsSync(DIR)) { console.error(`REFUSED: no box scores at ${path.relative(REPO, DIR)}`); process.exit(2); }
const days = fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")));
const hands = fs.existsSync(HANDS_FILE) ? JSON.parse(fs.readFileSync(HANDS_FILE, "utf8")).people ?? {} : {};
const handOf = (id) => { const h = hands[id]?.pitchHand; return h === "L" || h === "R" ? h : null; }; // switch pitchers ("S") have no single hand

// ── running state (only games dated before the current date) ───────────────────────────────────────────────────────
const pitchers = new Map(); // id -> { appsK: [], startsBF: [], bf, k, bb, hr }
const teamBat = new Map(); // team -> [{ pa, k, oppStarterHand }]
const teamRelief = new Map(); // team -> { bf, k, bb, hr }
const teamRunsAllowed = new Map(); // team -> { runs, games }
const batters = new Map(); // id -> totals, per-game series, startedPA, byHand
const league = { pa: 0, h: 0, d: 0, t: 0, hr: 0, r: 0, rbi: 0, k: 0, bb: 0, teamGames: 0, runs: 0, startPAHist: new Array(9).fill(0) };
const residuals = []; // BF − pregame E[BF], every earlier start
const fitRows = { v1k: [], v2k: [], v2hk: [], v2hits: [], v2hhits: [], rbi: [] }; // walk-forward training rows (month-tagged)
const params = {}; // month -> fitted parameters
const emptyBatter = () => ({ pa: 0, h: 0, d: 0, t: 0, hr: 0, r: 0, rbi: 0, k: 0, bb: 0, games: { hits: [], tb: [], hrr: [] }, startedPA: [], byHand: { L: { pa: 0, k: 0, bb: 0, hr: 0 }, R: { pa: 0, k: 0, bb: 0, hr: 0 } } });

/** Run / RBI coefficients from batter-games before `date` (fit as soon as 1,000 exist, then monthly). */
function fitRuns(rows) {
  if (rows.length < 1000) return null;
  const ls = (X, y) => { const n = X[0].length; const A = Array.from({ length: n }, () => new Array(n).fill(0)); const v = new Array(n).fill(0); X.forEach((x, i) => { for (let a = 0; a < n; a += 1) { v[a] += x[a] * y[i]; for (let b = 0; b < n; b += 1) A[a][b] += x[a] * x[b]; } }); for (let c = 0; c < n; c += 1) { let p = c; for (let r = c + 1; r < n; r += 1) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; [v[c], v[p]] = [v[p], v[c]]; for (let r = 0; r < n; r += 1) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < n; k += 1) A[r][k] -= f * A[c][k]; v[r] -= f * v[c]; } } return v.map((x, i) => Math.max(0, x / A[i][i])); };
  const [bHR, bH, bO] = ls(rows.map((x) => [x.hr, x.h - x.hr, x.pa - x.h]), rows.map((x) => x.rbi));
  const [gOn, gO] = ls(rows.map((x) => [x.h - x.hr + x.bb, x.pa - x.h - x.bb]), rows.map((x) => x.r - x.hr));
  return { bHR: Math.max(1, bHR), bH, bO, gOn: Math.min(0.95, gOn), gO: Math.min(0.5, gO), fitOn: rows.length };
}
function refit(month) {
  const earlier = (rows) => rows.filter((x) => x.month < month);
  const pick = (rows, grid) => { const tr = earlier(rows); if (tr.length < 150) return null; let best = null; grid.forEach((g, i) => { const s = tr.reduce((a, x) => a + x.ll[i], 0); if (!best || s > best.s) best = { g, i, s }; }); return best; };
  // v1 (as registered): r by maximum likelihood on earlier-month starts with ≥ 1 previous start.
  const v1tr = earlier(fitRows.v1k);
  let v1r = null;
  if (v1tr.length >= 150) { let best = null; for (const r of [2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 128, 256]) { let ll = 0; for (const x of v1tr) ll += Math.log(Math.max(1e-12, nbPmf(x.k, x.mu, r))); if (!best || ll > best.ll) best = { r, ll }; } v1r = best.r; }
  const runs = fitRuns(fitRows.rbi); // every earlier batter-game of the season (all are before this date)
  params[month] = { v1r, v2kKappa: pick(fitRows.v2k, V2.kKappaGrid)?.g ?? null, v2hkKappa: pick(fitRows.v2hk, V2.kKappaGrid)?.g ?? null, v2hitKappa: pick(fitRows.v2hits, V2.hitKappaGrid)?.g ?? null, v2hhitKappa: pick(fitRows.v2hhits, V2.hitKappaGrid)?.g ?? null, runs };
}

// ── pitcher-strikeout models ───────────────────────────────────────────────────────────────────────────────────────
function kFeatures(pid, opp, oppHandOfStarter) {
  const pt = pitchers.get(pid) ?? { appsK: [], startsBF: [], bf: 0, k: 0, bb: 0, hr: 0 };
  const last = pt.startsBF.slice(-K1.lastStarts);
  const eBF = (last.reduce((a, b) => a + b, 0) + K1.bfPriorStarts * K1.leagueStarterBF) / (last.length + K1.bfPriorStarts);
  const L = league.pa ? league.k / league.pa : 0.22;
  const pk = shrink(pt.k, pt.bf, K1.pitcherPriorBF, L);
  const tg = (teamBat.get(opp) ?? []).slice(-K1.lineupGames);
  const lk = shrink(tg.reduce((a, g) => a + g.k, 0), tg.reduce((a, g) => a + g.pa, 0), K1.lineupPriorPA, L);
  let lkHand = null;
  if (oppHandOfStarter) { const th = (teamBat.get(opp) ?? []).filter((g) => g.oppStarterHand === oppHandOfStarter).slice(-V2.handLineupGames); lkHand = shrink(th.reduce((a, g) => a + g.k, 0), th.reduce((a, g) => a + g.pa, 0), V2.handLineupPriorPA, lk); }
  return { pt, eBF, startsSeen: last.length, L, pk, lk, lkHand, p: log5(pk, lk, L), pHand: lkHand == null ? null : log5(pk, lkHand, L) };
}
const currentK = (pt) => { const s = pt.appsK; if (s.length < CURRENT.kMin) return null; const mu = 0.55 * mean(s.slice(-3)) + 0.45 * mean(s); const sigma = Math.max(s.length ? pstdev(s) : 0, CURRENT.kSigmaFloor); return { mu, pmf: normalCountPmf(mu, sigma, SUPPORT.k) }; };
const bfPmf = (eBF) => { if (residuals.length < V2.minResiduals) return null; const o = new Array(V2.bfMax + 1).fill(0); for (const r of residuals) o[Math.min(V2.bfMax, Math.max(1, Math.round(eBF + r)))] += 1; return o.map((x) => x / residuals.length); };
const kMixture = (bf, p, kappa) => { const o = new Array(SUPPORT.k).fill(0); bf.forEach((w, n) => { if (!w) return; betaBinom(n, p, kappa).forEach((q, k) => { o[Math.min(k, SUPPORT.k - 1)] += w * q; }); }); return o; };

// ── batter models ──────────────────────────────────────────────────────────────────────────────────────────────────
const lr = (k) => (league.pa ? league[k] / league.pa : null);
function batterRates(b) {
  return { k: shrink(b.k, b.pa, B1.k, lr("k")), bb: shrink(b.bb, b.pa, B1.bb, lr("bb")), hr: shrink(b.hr, b.pa, B1.hr, lr("hr")), h: shrink(b.h, b.pa, B1.h, lr("h")), d: shrink(b.d, b.pa, B1.d, lr("d")), t: shrink(b.t, b.pa, B1.t, lr("t")), r: shrink(b.r, b.pa, B1.r, lr("r")), rbi: shrink(b.rbi, b.pa, B1.rbi, lr("rbi")) };
}
/** Hit-type probabilities per PA, DIPS-style as in v1: K/BB/HR given; non-HR hits keep the batter's own BABIP. */
function outcomeProbs(own, pK, pBB, pHR) {
  const nonHrHit = Math.max(0, own.h - own.hr);
  const bipOwn = Math.max(1e-6, 1 - own.k - own.bb - own.hr);
  const babip = Math.min(0.6, nonHrHit / bipOwn);
  const p1 = Math.max(0, 1 - pK - pBB - pHR) * babip;
  const dShare = nonHrHit > 0 ? Math.min(0.5, own.d / nonHrHit) : 0.2;
  const tShare = nonHrHit > 0 ? Math.min(0.1, own.t / nonHrHit) : 0.02;
  return { hr: pHR, t: p1 * tShare, d: p1 * dShare, s: p1 * (1 - dShare - tShare), bb: pBB };
}
const currentB = (series, floor) => { if (series.length < CURRENT.bMin) return null; const mu = 0.5 * mean(series.slice(-10)) + 0.5 * mean(series); const sigma = Math.max(pstdev(series), floor); return { mu, sigma }; };
const ePAOf = (b) => { const s = b.startedPA.slice(-B1.pa.last); return (s.reduce((a, x) => a + x, 0) + B1.pa.games * B1.pa.mean) / (s.length + B1.pa.games); };

/** v1 as registered (no matchup inputs exist for historical seasons), computed exactly rather than by its 2,000 draws. */
function v1Batter(b) {
  const own = batterRates(b);
  const pr = outcomeProbs(own, own.k, own.bb, own.hr);
  const xr = Math.max(0, own.r - own.hr); const xrbi = Math.max(0, own.rbi - own.hr);
  const cats = [["hr", 1, 4, 1], ["t", 1, 3, 0], ["d", 1, 2, 0], ["s", 1, 1, 0]];
  const pOut = Math.max(0, 1 - cats.reduce((a, [c]) => a + pr[c], 0));
  const per = { hits: [pOut, 0], tb: [pOut, 0, 0, 0, 0], hr: [1 - pr.hr, pr.hr], r: [0, 0, 0], rbi: [0, 0, 0], hrr: new Array(6).fill(0) };
  for (const [c, , tb] of cats) { per.hits[1] += pr[c]; per.tb[tb] += pr[c]; }
  const bern = (q) => [1 - q, q];
  for (const [c, h, , isHr] of [...cats, ["out", 0, 0, 0]]) {
    const w = c === "out" ? pOut : pr[c];
    const rr = conv([1 - 0, 0].map((_, i) => (i === isHr ? 1 : 0)), bern(xr), 3); // a homer scores the batter
    const bi = conv([0, 0].map((_, i) => (i === isHr ? 1 : 0)), bern(xrbi), 3);
    rr.forEach((q, i) => { per.r[i] += w * q; }); bi.forEach((q, i) => { per.rbi[i] += w * q; });
    const s = conv(rr, bi, 5); s.forEach((q, i) => { per.hrr[i + h] += w * q; });
  }
  const ePA = ePAOf(b); const lo = Math.floor(ePA); const fr = ePA - lo;
  const out = {};
  for (const [m, len] of Object.entries({ hits: SUPPORT.hits, tb: SUPPORT.tb, hr: SUPPORT.hr, r: SUPPORT.r, rbi: SUPPORT.rbi, hrr: SUPPORT.hrr })) out[m] = mix([[1 - fr, convPow(per[m], lo, len)], [fr, convPow(per[m], lo + 1, len)]], len);
  return out;
}

/** League starter PA histogram, exponentially tilted to mean ePA. */
function paPmf(ePA) {
  const h = league.startPAHist; const tot = h.reduce((a, b) => a + b, 0); if (tot < 500) return null;
  const base = h.map((x) => x / tot);
  const meanAt = (th) => { let z = 0; let m = 0; base.forEach((p, k) => { const w = p * Math.exp(th * k); z += w; m += w * k; }); return m / z; };
  let lo = -5; let hi = 5; for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (meanAt(mid) < ePA) lo = mid; else hi = mid; }
  const th = (lo + hi) / 2; const w = base.map((p, k) => p * Math.exp(th * k)); const z = w.reduce((a, b) => a + b, 0); return w.map((x) => x / z);
}

/** v2: PA distribution, opposing starter + bullpen (log5), hit over-dispersion, outcome-coherent runs and RBI. */
function v2Batter(b, ctx, kappa, runs, useHand, markets = ["hits", "tb", "hr", "r", "rbi", "hrr"]) {
  const own = batterRates(b);
  const L = { k: lr("k"), bb: lr("bb"), hr: lr("hr") };
  let vsB = own;
  if (useHand && ctx.starterHand) { const s = b.byHand[ctx.starterHand]; vsB = { ...own, k: shrink(s.k, s.pa, V2.handBatterPriorPA, own.k), bb: shrink(s.bb, s.pa, V2.handBatterPriorPA, own.bb), hr: shrink(s.hr, s.pa, V2.handBatterPriorPA, own.hr) }; }
  const sh = ctx.starterShare;
  const pK = sh * log5(vsB.k, ctx.st.k, L.k) + (1 - sh) * log5(own.k, ctx.pen.k, L.k);
  const pBB = sh * log5(vsB.bb, ctx.st.bb, L.bb) + (1 - sh) * log5(own.bb, ctx.pen.bb, L.bb);
  const pHR = sh * log5(vsB.hr, ctx.st.hr, L.hr) + (1 - sh) * log5(own.hr, ctx.pen.hr, L.hr);
  const base = outcomeProbs(own, pK, pBB, pHR);
  // Run / RBI per outcome, scaled by the batter's own record vs league expectation and the opponent's runs allowed.
  const expRBI = runs.bHR * b.hr + runs.bH * (b.h - b.hr) + runs.bO * (b.pa - b.h);
  const expR = b.hr + runs.gOn * (b.h - b.hr + b.bb) + runs.gO * (b.pa - b.h - b.bb);
  const mRBI = ((b.rbi + V2.runMultPrior) / (expRBI + V2.runMultPrior)) * ctx.runEnv;
  const mR = ((b.r + V2.runMultPrior) / (expR + V2.runMultPrior)) * ctx.runEnv;
  const len = 6;
  const bern = (q) => { const x = Math.min(0.95, Math.max(0, q)); return [1 - x, x]; };
  const parts = Object.fromEntries(markets.map((mk) => [mk, []]));
  const mPts = gammaPoints(kappa);
  const paDist = ctx.paDist;
  for (const m of mPts) {
    let hitSum = (base.hr + base.t + base.d + base.s) * m; const scale = hitSum > 0.95 - base.bb ? (0.95 - base.bb) / hitSum : 1; hitSum *= scale;
    const p = { hr: base.hr * m * scale, t: base.t * m * scale, d: base.d * m * scale, s: base.s * m * scale, bb: base.bb };
    const pOut = Math.max(0, 1 - hitSum - p.bb);
    const classes = [
      { w: p.hr, h: 1, tb: 4, hr: 1, r: [0, 1], rbi: conv([0, 1], poisson(Math.max(0, runs.bHR - 1) * mRBI, len), len) },
      { w: p.t, h: 1, tb: 3, hr: 0, r: bern(runs.gOn * mR), rbi: poisson(runs.bH * mRBI, len) },
      { w: p.d, h: 1, tb: 2, hr: 0, r: bern(runs.gOn * mR), rbi: poisson(runs.bH * mRBI, len) },
      { w: p.s, h: 1, tb: 1, hr: 0, r: bern(runs.gOn * mR), rbi: poisson(runs.bH * mRBI, len) },
      { w: p.bb, h: 0, tb: 0, hr: 0, r: bern(runs.gOn * mR), rbi: poisson(runs.bO * mRBI, len) },
      { w: pOut, h: 0, tb: 0, hr: 0, r: bern(runs.gO * mR), rbi: poisson(runs.bO * mRBI, len) },
    ];
    const per = { hits: [0, 0], tb: [0, 0, 0, 0, 0], hr: [0, 0], r: new Array(len).fill(0), rbi: new Array(len).fill(0), hrr: new Array(len + 3).fill(0) };
    for (const c of classes) {
      per.hits[c.h] += c.w; per.tb[c.tb] += c.w; per.hr[c.hr] += c.w;
      c.r.forEach((q, i) => { per.r[i] += c.w * q; }); c.rbi.forEach((q, i) => { per.rbi[i] += c.w * q; });
      conv(c.r, c.rbi, len + 2).forEach((q, i) => { per.hrr[i + c.h] += c.w * q; });
    }
    for (const mk of Object.keys(parts)) {
      const L2 = SUPPORT[mk];
      parts[mk].push([1 / mPts.length, mixPowers(per[mk], paDist, L2)]);
    }
  }
  const out = {}; for (const mk of Object.keys(parts)) out[mk] = mix(parts[mk], SUPPORT[mk]);
  return out;
}

// ── MLB-005: engine read-outs (the only addition to the frozen replay) ──────────────────────────────────────────────
// v2 (substitution) state, from earlier games only: league replacement hazard by trip, each batter's own record, and the
// league's non-starter batting rates.
const hz = { risk: new Array(10).fill(0), event: new Array(10).fill(0) };
const slotRecords = new Map(); // batter id -> [{ nStart, nSlot }]
const bench = { pa: 0, h: 0, d: 0, t: 0, hr: 0, k: 0, bb: 0 };
function updateSubstitutionState(day) {
  const slots = new Map(); // `${gamePk}|${team}|${digit}` -> { starter: row|null, nSlot }
  for (const r of day.rows) {
    if (!r.batting || typeof r.battingOrder !== "string" || !r.team) continue;
    const key = `${r.gamePk}|${r.team}|${r.battingOrder[0]}`;
    const sl = slots.get(key) ?? { starter: null, nSlot: 0 };
    sl.nSlot += r.batting.pa ?? 0;
    if (r.battingOrder.endsWith("00")) sl.starter = r;
    else { const x = r.batting; bench.pa += x.pa ?? 0; bench.h += x.h ?? 0; bench.d += x.d ?? 0; bench.t += x.t ?? 0; bench.hr += x.hr ?? 0; bench.k += x.so ?? 0; bench.bb += (x.bb ?? 0) + (x.hbp ?? 0); }
    slots.set(key, sl);
  }
  for (const sl of slots.values()) {
    if (!sl.starter) continue;
    const nStart = sl.starter.batting.pa ?? 0;
    for (let j = 1; j <= nStart && j < hz.risk.length; j += 1) if (sl.nSlot > j) { hz.risk[j] += 1; if (j === nStart) hz.event[j] += 1; }
    const a = slotRecords.get(sl.starter.playerId) ?? []; a.push({ nStart, nSlot: sl.nSlot }); slotRecords.set(sl.starter.playerId, a);
  }
}
const leagueHazard = () => hz.risk.map((r, j) => (j === 0 || !r ? 0 : hz.event[j] / r));
function hazardFor(playerId, h) {
  let obs = 0; let exp = 0;
  for (const { nStart, nSlot } of slotRecords.get(playerId) ?? []) {
    if (nStart < nSlot) obs += 1;
    for (let j = 1; j <= nStart && j < h.length; j += 1) if (nSlot > j) exp += h[j];
  }
  const mult = (obs + 5) / (exp + 5);
  return h.map((x) => Math.min(0.95, x * mult));
}

const engineAudit = { games: 0, skipped: {}, worlds: 0, discarded: 0, violations: 0, samples: [], paSim: 0, paAct: 0, nBat: 0, ms: 0 };
const gameRows = [];
const lgGame = { n: 0, homeWins: 0, totals: new Array(31).fill(0) };
let pendingGames = [];
const ENGINE_PARAMS = { ...DEFAULT_ENGINE_PARAMS, rules: OFFICIAL_RULES_2026, research: { explicitPa: true, workloadPmf: true } };
const ENGINE_PARAMS_SUB = { ...DEFAULT_ENGINE_PARAMS, rules: OFFICIAL_RULES_2026, research: { explicitPa: true, workloadPmf: true, substitution: true } };
const engineAuditSub = { games: 0, skipped: {}, worlds: 0, discarded: 0, violations: 0, samples: [], paSim: 0, paAct: 0, nBat: 0, ms: 0 };
const gameRowsSub = [];
const engineAuditHfa = { games: 0, skipped: {}, worlds: 0, discarded: 0, violations: 0, samples: [], paSim: 0, paAct: 0, nBat: 0, ms: 0 };
const gameRowsHfa = [];
const engineAuditB2 = { games: 0, skipped: {}, worlds: 0, discarded: 0, violations: 0, samples: [], paSim: 0, paAct: 0, nBat: 0, ms: 0 };
const gameRowsB2 = [];
function engineReadouts(day, teamsOf, starterOf, mode = "v1") {
  const out = new Map();
  const audit = mode === "v1" ? engineAudit : mode === "sub" ? engineAuditSub : mode === "b2" ? engineAuditB2 : engineAuditHfa;
  const params = mode === "v1" ? ENGINE_PARAMS : ENGINE_PARAMS_SUB;
  const lgH = mode !== "v1" ? leagueHazard() : null;
  const mH = mode === "hfa" ? { home: hfaMult("home"), away: hfaMult("away") } : null;
  const t0 = Date.now();
  const meta = new Map((day.games ?? []).map((g) => [g.gamePk, g]));
  const skip = (why) => { audit.skipped[why] = (audit.skipped[why] ?? 0) + 1; };
  if (mode !== "v1" && bench.pa < 500) { for (const _ of teamsOf.keys()) skip("burn-in-bench"); return out; }
  const Lr = { k: lr("k"), bb: lr("bb"), hr: lr("hr") };
  const pitcherCtx = (pid, team) => {
    const sp = pitchers.get(pid) ?? { startsBF: [], bf: 0, k: 0, bb: 0, hr: 0 };
    const lastBF = sp.startsBF.slice(-K1.lastStarts);
    const eBF = (lastBF.reduce((a, v) => a + v, 0) + K1.bfPriorStarts * K1.leagueStarterBF) / (lastBF.length + K1.bfPriorStarts);
    const pen = teamRelief.get(team) ?? { bf: 0, k: 0, bb: 0, hr: 0 };
    return {
      eBF,
      st: { k: shrink(sp.k, sp.bf, V2.starterPrior.k, Lr.k), bb: shrink(sp.bb, sp.bf, V2.starterPrior.bb, Lr.bb), hr: shrink(sp.hr, sp.bf, V2.starterPrior.hr, Lr.hr) },
      pen: { k: shrink(pen.k, pen.bf, V2.penPriorBF, Lr.k), bb: shrink(pen.bb, pen.bf, V2.penPriorBF, Lr.bb), hr: shrink(pen.hr, pen.bf, V2.penPriorBF, Lr.hr) },
    };
  };
  const mkPa = (own, k, bb, hr) => { const p = outcomeProbs(own, k, bb, hr); const tot = k + bb + p.hr + p.t + p.d + p.s; return { strikeout: k, walk: bb, single: p.s, double: p.d, triple: p.t, homeRun: p.hr, reachOnError: 0, fieldOut: Math.max(0, 1 - tot) }; };
  for (const gamePk of teamsOf.keys()) {
    const rowsG = day.rows.filter((r) => r.gamePk === gamePk);
    const team = { away: rowsG.find((r) => r.side === "away")?.team, home: rowsG.find((r) => r.side === "home")?.team };
    if (!team.away || !team.home) { skip("teams"); continue; }
    const lineupOf = (side) => rowsG.filter((r) => r.side === side && r.batting && typeof r.battingOrder === "string" && r.battingOrder.endsWith("00")).sort((a, b) => Number(a.battingOrder) - Number(b.battingOrder));
    const L = { away: lineupOf("away"), home: lineupOf("home") };
    if (L.away.length !== 9 || L.home.length !== 9) { skip("lineup-not-9"); continue; }
    const sp = { away: starterOf.get(`${gamePk}|${team.away}`), home: starterOf.get(`${gamePk}|${team.home}`) };
    if (sp.away == null || sp.home == null) { skip("no-starter"); continue; }
    if (residuals.length < V2.minResiduals || !league.pa) { skip("burn-in"); continue; }
    const gt = meta.get(gamePk)?.gameType; const ruleset = gt === "R" ? "REGULAR_SEASON" : gt ? "POSTSEASON" : null;
    if (!ruleset) { skip("ruleset"); continue; }
    // Away batters face the HOME starter and bullpen; home batters face the away ones.
    const ctx = { away: pitcherCtx(sp.home, team.home), home: pitcherCtx(sp.away, team.away) };
    const batIn = (r, side) => {
      const own = batterRates(batters.get(r.playerId) ?? emptyBatter()); const c = ctx[side];
      const base = { playerId: r.playerId, name: String(r.playerId), team: r.team, expHits: null, expTotalBases: null, expHrr: null,
        pa: { vsStarter: mkPa(own, log5(own.k, c.st.k, Lr.k), log5(own.bb, c.st.bb, Lr.bb), log5(own.hr, c.st.hr, Lr.hr)), vsBullpen: mkPa(own, log5(own.k, c.pen.k, Lr.k), log5(own.bb, c.pen.bb, Lr.bb), log5(own.hr, c.pen.hr, Lr.hr)) } };
      if (mode === "v1") return base;
      const bo = { h: bench.h / bench.pa, d: bench.d / bench.pa, t: bench.t / bench.pa, hr: bench.hr / bench.pa, k: bench.k / bench.pa, bb: bench.bb / bench.pa };
      const withSub = { ...base, subHazard: hazardFor(r.playerId, lgH),
        subPa: { vsStarter: mkPa(bo, log5(bo.k, c.st.k, Lr.k), log5(bo.bb, c.st.bb, Lr.bb), log5(bo.hr, c.st.hr, Lr.hr)), vsBullpen: mkPa(bo, log5(bo.k, c.pen.k, Lr.k), log5(bo.bb, c.pen.bb, Lr.bb), log5(bo.hr, c.pen.hr, Lr.hr)) } };
      if (mode !== "hfa") return withSub;
      const m = mH[side];
      return { ...withSub, pa: { vsStarter: applyMult(withSub.pa.vsStarter, m), vsBullpen: applyMult(withSub.pa.vsBullpen, m) }, subPa: { vsStarter: applyMult(withSub.subPa.vsStarter, m), vsBullpen: applyMult(withSub.subPa.vsBullpen, m) } };
    };
    const pIn = (pid, tm, side) => {
      const eBF = ctx[side === "away" ? "home" : "away"].eBF;
      if (mode !== "b2") return { playerId: pid, name: String(pid), team: tm, expStrikeouts: null, bfLimitPmf: bfPmf(eBF) };
      const e3 = Math.max(V3.minFloor, eBF + (v3Delta[day.date.slice(0, 7)]?.[situationOf(pitchers.get(pid)?.appsMeta ?? [], day.date)] ?? 0));
      return { playerId: pid, name: String(pid), team: tm, expStrikeouts: null, bfLimitPmf: bfPmf3(e3) ?? bfPmf(eBF) };
    };
    const game = {
      gamePk, date: day.date, slug: String(gamePk), awayTeam: team.away, homeTeam: team.home, awayTeamName: team.away, homeTeamName: team.home, venue: "", firstPitch: null,
      awayLineup: L.away.map((r) => batIn(r, "away")), homeLineup: L.home.map((r) => batIn(r, "home")),
      awayStarter: pIn(sp.away, team.away, "away"), homeStarter: pIn(sp.home, team.home, "home"),
      completeness: { level: "ready", notes: [], awayLineupCount: 9, homeLineupCount: 9, hasAwayStarter: true, hasHomeStarter: true, missingFamilies: [] },
      market: null, ruleset, rulesetBasis: "GAME_TYPE",
    };
    const auto = automaticRunnerApplies(OFFICIAL_RULES_2026, ruleset);
    const rng = new SeededRng(`mlb005-coh|${gamePk}`);
    const H = (len) => new Array(len).fill(0);
    const bat = { away: L.away.map(() => ({ hits: H(SUPPORT.hits), tb: H(SUPPORT.tb), hr: H(SUPPORT.hr), r: H(SUPPORT.r), rbi: H(SUPPORT.rbi), hrr: H(SUPPORT.hrr), pa: 0 })), home: L.home.map(() => ({ hits: H(SUPPORT.hits), tb: H(SUPPORT.tb), hr: H(SUPPORT.hr), r: H(SUPPORT.r), rbi: H(SUPPORT.rbi), hrr: H(SUPPORT.hrr), pa: 0 })) };
    const kH = { away: H(SUPPORT.k), home: H(SUPPORT.k) };
    let homeWins = 0; const totH = H(31); let done = 0; let discarded = 0;
    const put = (h, x) => { h[Math.min(Math.max(0, x), h.length - 1)] += 1; };
    while (done < ENG_WORLDS) {
      const events = [];
      const res = simulateGame(game, rng, params, (e) => events.push(e));
      if (res.incomplete) { discarded += 1; if (discarded > ENG_WORLDS) break; continue; }
      const v = checkWorld({ game, result: res, events, rules: OFFICIAL_RULES_2026, automaticRunner: auto });
      audit.worlds += 1;
      if (v.length) { audit.violations += 1; if (audit.samples.length < 5) audit.samples.push({ gamePk, v: v.slice(0, 3) }); }
      for (const [side, lines] of [["away", res.awayStarterBatters ?? res.awayBatters], ["home", res.homeStarterBatters ?? res.homeBatters]]) lines.forEach((l, i) => { const a = bat[side][i]; put(a.hits, l.hits); put(a.tb, l.totalBases); put(a.hr, l.homeRuns); put(a.r, l.runs); put(a.rbi, l.rbi); put(a.hrr, l.hits + l.runs + l.rbi); a.pa += l.pa; });
      put(kH.away, res.awayStarter.strikeouts); put(kH.home, res.homeStarter.strikeouts);
      if (res.homeRuns > res.awayRuns) homeWins += 1;
      put(totH, res.awayRuns + res.homeRuns);
      done += 1;
    }
    audit.discarded += discarded;
    if (done < ENG_WORLDS) { skip("unresolved"); continue; }
    audit.games += 1;
    const sm = (h) => h.map((c) => (c + 0.5 / h.length) / (done + 0.5));
    for (const side of ["away", "home"]) L[side].forEach((r, i) => {
      const a = bat[side][i];
      out.set(`${gamePk}|${r.playerId}`, { hits: sm(a.hits), tb: sm(a.tb), hr: sm(a.hr), r: sm(a.r), rbi: sm(a.rbi), hrr: sm(a.hrr), meanPa: a.pa / done });
      audit.paSim += a.pa / done; audit.paAct += r.batting.pa ?? 0; audit.nBat += 1;
    });
    out.set(`${gamePk}|P|${sp.away}`, sm(kH.away)); out.set(`${gamePk}|P|${sp.home}`, sm(kH.home));
    // Game level, scored against the actual final (outcome only) with league-to-date baselines.
    // A team's runs = the runs its OPPONENT's pitchers allowed. Batting lines miss pinch runners who scored without a PA
    // (the capture keeps PA > 0 lines), so batting runs undercount ~9% of games; pitching runs match the official final
    // in every 2024–2025 game (validate-boxscore-history.mjs).
    const runsOf = (side) => rowsG.filter((r) => r.side !== side && r.pitching).reduce((a, r) => a + (r.pitching.r ?? 0), 0);
    const yAway = runsOf("away"); const yHome = runsOf("home");
    if (yAway !== yHome) {
      const base = lgGame.n >= 50 ? { pHome: lgGame.homeWins / lgGame.n, total: lgGame.totals.map((c) => (c + 0.5 / 31) / (lgGame.n + 0.5)) } : null;
      if (base) (mode === "v1" ? gameRows : mode === "sub" ? gameRowsSub : mode === "b2" ? gameRowsB2 : gameRowsHfa).push({ gamePk, date: day.date, yHome: yHome > yAway ? 1 : 0, total: yAway + yHome, engine: { pHome: homeWins / done, total: sm(totH) }, base });
      if (mode === "v1") pendingGames.push({ home: yHome > yAway ? 1 : 0, total: yAway + yHome });
    }
  }
  audit.ms += Date.now() - t0;
  return out;
}

// ── replay ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const kRows = [];
const bRows = [];
let month = null;
const counts = { starts: 0, batterStarts: 0, missingBoxscores: 0 };
for (const day of days) {
  const D = day.date; const m = D.slice(0, 7);
  if (m !== month) { refit(m); month = m; if (KV3) v3Delta[m] = fitV3(m); }
  const P = params[m];
  if (!P.runs) P.runs = fitRuns(fitRows.rbi); // early season: fit as soon as enough earlier games exist
  counts.missingBoxscores += (day.games ?? []).filter((g) => g.boxscore !== "OK").length;
  const teamsOf = new Map(); for (const r of day.rows) if (r.team) { const s = teamsOf.get(r.gamePk) ?? new Set(); s.add(r.team); teamsOf.set(r.gamePk, s); }
  const oppOf = (r) => [...(teamsOf.get(r.gamePk) ?? [])].find((t) => t !== r.team) ?? null;
  const starterOf = new Map(); for (const r of day.rows) if (r.pitching?.started) starterOf.set(`${r.gamePk}|${r.team}`, r.playerId);
  const preEBF = new Map();
  const preE3 = new Map();
  for (const g of pendingGames) { lgGame.n += 1; lgGame.homeWins += g.home; lgGame.totals[Math.min(30, g.total)] += 1; }
  pendingGames = [];
  const eng = D >= SCORE_FROM ? engineReadouts(day, teamsOf, starterOf) : new Map();
  const engSub = (SUBST || HFA) && D >= SCORE_FROM ? engineReadouts(day, teamsOf, starterOf, "sub") : new Map();
  const engHfa = HFA && D >= SCORE_FROM ? engineReadouts(day, teamsOf, starterOf, "hfa") : new Map();
  const engB2 = B2CHECK && D >= SCORE_FROM ? engineReadouts(day, teamsOf, starterOf, "b2") : new Map();

  // Pitcher starts on D.
  for (const r of day.rows) {
    if (!r.pitching?.started) continue;
    counts.starts += 1;
    const opp = oppOf(r);
    const f = kFeatures(r.playerId, opp, handOf(r.playerId));
    preEBF.set(r.playerId, f.eBF);
    const k = r.pitching.so ?? 0;
    const cur = currentK(f.pt);
    if (f.startsSeen >= 1) fitRows.v1k.push({ month: m, mu: f.eBF * f.p, k });
    const bf = bfPmf(f.eBF);
    let v2 = null; let v2h = null;
    if (bf) {
      const grid = V2.kKappaGrid.map((kap) => kMixture(bf, f.p, kap));
      fitRows.v2k.push({ month: m, ll: grid.map((g) => Math.log(Math.max(1e-12, g[Math.min(k, SUPPORT.k - 1)]))) });
      if (P.v2kKappa != null) v2 = grid[V2.kKappaGrid.indexOf(P.v2kKappa)];
      if (f.pHand != null) {
        const gh = V2.kKappaGrid.map((kap) => kMixture(bf, f.pHand, kap));
        fitRows.v2hk.push({ month: m, ll: gh.map((g) => Math.log(Math.max(1e-12, g[Math.min(k, SUPPORT.k - 1)]))) });
        if (P.v2hkKappa != null) v2h = gh[V2.kKappaGrid.indexOf(P.v2hkKappa)];
      }
    }
    const v1 = P.v1r != null ? fit(Array.from({ length: SUPPORT.k + 30 }, (_, i) => nbPmf(i, f.eBF * f.p, P.v1r)), SUPPORT.k) : null;
    const ek = eng.get(`${r.gamePk}|P|${r.playerId}`); const eks = engSub.get(`${r.gamePk}|P|${r.playerId}`); const ekh = engHfa.get(`${r.gamePk}|P|${r.playerId}`); const ekb = engB2.get(`${r.gamePk}|P|${r.playerId}`);
    let v3 = null; let sit = null;
    if (KV3) {
      sit = situationOf(pitchers.get(r.playerId)?.appsMeta ?? [], D);
      const e3 = Math.max(V3.minFloor, f.eBF + (v3Delta[m]?.[sit] ?? 0));
      preE3.set(r.playerId, { e3, e2: f.eBF, sit });
      const bf3 = bfPmf3(e3);
      if (bf3 && P.v2kKappa != null) v3 = kMixture(bf3, f.p, P.v2kKappa);
    }
    if (D >= SCORE_FROM && cur && v1 && v2) kRows.push({ date: D, y: k, models: { current: cur.pmf, v1, v2, ...(v2h ? { v2h } : {}), ...(ek ? { engine: ek, v2inf: kMixture(bf, f.p, Infinity) } : {}), ...(eks ? { engineSub: eks } : {}), ...(ekh ? { engineHfa: ekh } : {}), ...(ekb ? { engineB2: ekb } : {}), ...(v3 ? { v3 } : {}) }, handKnown: v2h != null, engine: !!ek, engineSub: !!eks, pid: r.playerId, sit,
      ...(DECOMPOSE && P.v2kKappa != null ? { dec: { bfAct: r.pitching.bf ?? 0, eBF: f.eBF, p: f.p, kappa: P.v2kKappa, oracleBF: betaBinom(Math.max(0, r.pitching.bf ?? 0), f.p, P.v2kKappa), oracleBFbinom: betaBinom(Math.max(0, r.pitching.bf ?? 0), f.p, Infinity) } } : {}) });
  }

  // Batter starts on D.
  for (const r of day.rows) {
    if (!r.batting || typeof r.battingOrder !== "string" || !r.battingOrder.endsWith("00")) continue;
    counts.batterStarts += 1;
    const b = batters.get(r.playerId) ?? emptyBatter();
    const x = r.batting;
    const y = { hits: x.h ?? 0, tb: x.tb ?? 0, hrr: (x.h ?? 0) + (x.r ?? 0) + (x.rbi ?? 0), hr: x.hr ?? 0, r: x.r ?? 0, rbi: x.rbi ?? 0 };
    const opp = oppOf(r);
    const spId = starterOf.get(`${r.gamePk}|${opp}`) ?? null;
    if (!league.pa) continue;
    const curH = currentB(b.games.hits, CURRENT.floors.hits); const curT = currentB(b.games.tb, CURRENT.floors.tb); const curR = currentB(b.games.hrr, CURRENT.floors.hrr);
    const v1 = v1Batter(b);
    // Context for v2: the opposing starter's rates and expected share of this batter's PA; the opponent's bullpen.
    const sp = pitchers.get(spId) ?? { startsBF: [], bf: 0, k: 0, bb: 0, hr: 0 };
    const lastBF = sp.startsBF.slice(-K1.lastStarts);
    const eBFsp = (lastBF.reduce((a, v) => a + v, 0) + K1.bfPriorStarts * K1.leagueStarterBF) / (lastBF.length + K1.bfPriorStarts);
    const teamPA = league.teamGames ? league.pa / league.teamGames : 38;
    const pen = teamRelief.get(opp) ?? { bf: 0, k: 0, bb: 0, hr: 0 };
    const ra = teamRunsAllowed.get(opp) ?? { runs: 0, games: 0 };
    const lRuns = league.teamGames ? league.runs / league.teamGames : 4.5;
    const ctx = {
      starterShare: Math.min(V2.maxStarterShare, eBFsp / teamPA), starterHand: handOf(spId),
      st: { k: shrink(sp.k, sp.bf, V2.starterPrior.k, lr("k")), bb: shrink(sp.bb, sp.bf, V2.starterPrior.bb, lr("bb")), hr: shrink(sp.hr, sp.bf, V2.starterPrior.hr, lr("hr")) },
      pen: { k: shrink(pen.k, pen.bf, V2.penPriorBF, lr("k")), bb: shrink(pen.bb, pen.bf, V2.penPriorBF, lr("bb")), hr: shrink(pen.hr, pen.bf, V2.penPriorBF, lr("hr")) },
      runEnv: shrink(ra.runs, ra.games, V2.oppRunsPriorGames, lRuns) / lRuns,
      paDist: paPmf(ePAOf(b)),
    };
    let v2 = null; let v2h = null;
    if (ctx.paDist && P.runs) {
      // Dispersion training needs only the hits distribution under each κ; the full read-out is built for the fitted κ.
      const grid = V2.hitKappaGrid.map((kap) => v2Batter(b, ctx, kap, P.runs, false, ["hits"]));
      fitRows.v2hits.push({ month: m, ll: grid.map((g) => Math.log(Math.max(1e-12, g.hits[Math.min(y.hits, SUPPORT.hits - 1)]))) });
      const scoring = D >= SCORE_FROM && curH && curT && curR;
      if (P.v2hitKappa != null && scoring) v2 = v2Batter(b, ctx, P.v2hitKappa, P.runs, false);
      if (ctx.starterHand) {
        const gh = V2.hitKappaGrid.map((kap) => v2Batter(b, ctx, kap, P.runs, true, ["hits"]));
        fitRows.v2hhits.push({ month: m, ll: gh.map((g) => Math.log(Math.max(1e-12, g.hits[Math.min(y.hits, SUPPORT.hits - 1)]))) });
        if (P.v2hhitKappa != null && scoring) v2h = v2Batter(b, ctx, P.v2hhitKappa, P.runs, true);
      }
    }
    if (D >= SCORE_FROM && curH && curT && curR && v2) {
      const cur = { hits: normalCountPmf(curH.mu, curH.sigma, SUPPORT.hits), tb: normalCountPmf(curT.mu, curT.sigma, SUPPORT.tb), hrr: normalCountPmf(curR.mu, curR.sigma, SUPPORT.hrr) };
      const eb = eng.get(`${r.gamePk}|${r.playerId}`); const ebs = engSub.get(`${r.gamePk}|${r.playerId}`); const ebh = engHfa.get(`${r.gamePk}|${r.playerId}`); const ebb = engB2.get(`${r.gamePk}|${r.playerId}`);
      bRows.push({ date: D, y, models: { current: cur, v1, v2, ...(v2h ? { v2h } : {}), ...(eb ? { engine: eb, v2inf: v2Batter(b, ctx, Infinity, P.runs, false) } : {}), ...(ebs ? { engineSub: ebs } : {}), ...(ebh ? { engineHfa: ebh } : {}), ...(ebb ? { engineB2: ebb } : {}) }, handKnown: v2h != null, engine: !!eb, engineSub: !!ebs, pid: r.playerId,
        ...(DECOMPOSE ? (() => { const pa = Math.max(0, x.pa ?? 0); const delta = new Array(Math.max(pa + 1, 1)).fill(0); delta[pa] = 1; return { dec: { paAct: pa, ePA: ePAOf(b), oraclePA: v2Batter(b, { ...ctx, paDist: delta }, P.v2hitKappa, P.runs, false) } }; })() : {}) });
    }
  }

  // ── update the state with D's games (after every prediction for D) ──
  updateSubstitutionState(day);
  for (const r of day.rows) if (r.batting && (r.side === "home" || r.side === "away")) { const t = hfaTot[r.side]; const x = r.batting; t.pa += x.pa ?? 0; t.k += x.so ?? 0; t.bb += (x.bb ?? 0) + (x.hbp ?? 0); t.hr += x.hr ?? 0; t.h += (x.h ?? 0) - (x.hr ?? 0); }
  const teamGame = new Map();
  for (const r of day.rows) {
    if (r.pitching) {
      const q = r.pitching; const pt = pitchers.get(r.playerId) ?? { appsK: [], startsBF: [], bf: 0, k: 0, bb: 0, hr: 0 };
      (pt.appsMeta ??= []).push({ date: D, started: !!q.started, bf: q.bf ?? 0 });
      if (q.started && preE3.has(r.playerId)) { const x = preE3.get(r.playerId); residuals3.push((q.bf ?? 0) - x.e3); v3Train.push({ month: m, sit: x.sit, resid2: (q.bf ?? 0) - x.e2 }); }
      pt.appsK.push(q.so ?? 0); pt.bf += q.bf ?? 0; pt.k += q.so ?? 0; pt.bb += (q.bb ?? 0) + (q.hbp ?? 0); pt.hr += q.hr ?? 0;
      if (q.started) { pt.startsBF.push(q.bf ?? 0); if (preEBF.has(r.playerId)) residuals.push((q.bf ?? 0) - preEBF.get(r.playerId)); }
      else if (r.team) { const t = teamRelief.get(r.team) ?? { bf: 0, k: 0, bb: 0, hr: 0 }; t.bf += q.bf ?? 0; t.k += q.so ?? 0; t.bb += (q.bb ?? 0) + (q.hbp ?? 0); t.hr += q.hr ?? 0; teamRelief.set(r.team, t); }
      pitchers.set(r.playerId, pt);
    }
    if (r.batting && r.playerId != null) {
      const x = r.batting; const b = batters.get(r.playerId) ?? emptyBatter();
      const bbx = (x.bb ?? 0) + (x.hbp ?? 0);
      b.pa += x.pa ?? 0; b.h += x.h ?? 0; b.d += x.d ?? 0; b.t += x.t ?? 0; b.hr += x.hr ?? 0; b.r += x.r ?? 0; b.rbi += x.rbi ?? 0; b.k += x.so ?? 0; b.bb += bbx;
      if ((x.pa ?? 0) > 0 || (x.ab ?? 0) > 0) { b.games.hits.push(x.h ?? 0); b.games.tb.push(x.tb ?? 0); b.games.hrr.push((x.h ?? 0) + (x.r ?? 0) + (x.rbi ?? 0)); }
      const isStart = typeof r.battingOrder === "string" && r.battingOrder.endsWith("00");
      if (isStart) { b.startedPA.push(x.pa ?? 0); league.startPAHist[Math.min(8, x.pa ?? 0)] += 1; }
      const opp = oppOf(r); const hand = handOf(starterOf.get(`${r.gamePk}|${opp}`));
      if (hand === "L" || hand === "R") { const s = b.byHand[hand]; s.pa += x.pa ?? 0; s.k += x.so ?? 0; s.bb += bbx; s.hr += x.hr ?? 0; }
      batters.set(r.playerId, b);
      for (const k of ["h", "d", "t", "hr", "r", "rbi"]) league[k] += x[k] ?? 0;
      league.pa += x.pa ?? 0; league.k += x.so ?? 0; league.bb += bbx;
      fitRows.rbi.push({ month: m, pa: x.pa ?? 0, h: x.h ?? 0, hr: x.hr ?? 0, bb: bbx, r: x.r ?? 0, rbi: x.rbi ?? 0 });
      if (r.team) { const key = `${r.gamePk}|${r.team}`; const t = teamGame.get(key) ?? { team: r.team, opp, pa: 0, k: 0, runs: 0 }; t.pa += x.pa ?? 0; t.k += x.so ?? 0; t.runs += x.r ?? 0; teamGame.set(key, t); }
    }
  }
  for (const [key, t] of teamGame) {
    const gamePk = key.split("|")[0];
    const a = teamBat.get(t.team) ?? []; a.push({ pa: t.pa, k: t.k, oppStarterHand: handOf(starterOf.get(`${gamePk}|${t.opp}`)) }); teamBat.set(t.team, a);
    if (t.opp) { const ra = teamRunsAllowed.get(t.opp) ?? { runs: 0, games: 0 }; ra.runs += t.runs; ra.games += 1; teamRunsAllowed.set(t.opp, ra); }
    league.teamGames += 1; league.runs += t.runs;
  }
}

// ── scoring ────────────────────────────────────────────────────────────────────────────────────────────────────────
const clamp = (p) => Math.min(1 - 1e-6, Math.max(1e-6, p));
const cdf = (pmf) => { let s = 0; return pmf.map((p) => (s += p)); };
const pOver = (pmf, t) => pmf.reduce((a, p, k) => a + (k > t ? p : 0), 0);
const crps = (pmf, y) => cdf(pmf).reduce((a, F, k) => a + (F - (k >= y ? 1 : 0)) ** 2, 0);
const quant = (pmf, q) => { const F = cdf(pmf); return F.findIndex((x) => x >= q - 1e-12); };
function logistic(xs, ys) { let a = 0; let b = 1; for (let it = 0; it < 30; it += 1) { let ga = 0; let gb = 0; let haa = 0; let hab = 0; let hbb = 0; for (let i = 0; i < xs.length; i += 1) { const p = 1 / (1 + Math.exp(-(a + b * xs[i]))); const w = p * (1 - p); ga += ys[i] - p; gb += (ys[i] - p) * xs[i]; haa += w; hab += w * xs[i]; hbb += w * xs[i] * xs[i]; } const det = haa * hbb - hab * hab; if (Math.abs(det) < 1e-12) break; a += (hbb * ga - hab * gb) / det; b += (haa * gb - hab * ga) / det; } return { intercept: a, slope: b }; }
const auc = (s, y) => { const a = s.map((v, i) => ({ v, y: y[i] })).sort((p, q) => p.v - q.v); let i = 0; let sp = 0; const np = y.filter(Boolean).length; const nn = y.length - np; while (i < a.length) { let j = i; while (j < a.length && a[j].v === a[i].v) j += 1; const r = (i + j + 1) / 2; for (let k = i; k < j; k += 1) if (a[k].y) sp += r; i = j; } return np && nn ? (sp - (np * (np + 1)) / 2) / (np * nn) : null; };
/** Paired bootstrap of the mean difference, resampling whole dates (rows of one date move together). */
function bootByDate(rows, diff, iters = 2000, seed = 20261010) {
  const byDate = new Map(); rows.forEach((r, i) => { const a = byDate.get(r.date) ?? []; a.push(diff[i]); byDate.set(r.date, a); });
  const groups = [...byDate.values()].map((a) => [a.reduce((s, x) => s + x, 0), a.length]);
  let s = seed >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  const ms = []; for (let k = 0; k < iters; k += 1) { let t = 0; let n = 0; for (let i = 0; i < groups.length; i += 1) { const g = groups[Math.floor(rnd() * groups.length)]; t += g[0]; n += g[1]; } ms.push(t / n); }
  ms.sort((a, b) => a - b); return [ms[Math.floor(0.025 * iters)], ms[Math.floor(0.975 * iters)]];
}
function scoreMarket(rows, market, getPmf, getY, models, baseline) {
  const out = { n: rows.length, models: {}, vs: {} };
  const ys = rows.map(getY);
  for (const mod of models) {
    const pmfs = rows.map((r) => getPmf(r, mod));
    const nll = pmfs.map((p, i) => -Math.log(Math.max(1e-12, p[Math.min(ys[i], p.length - 1)])));
    const means = pmfs.map((p) => p.reduce((a, q, k) => a + q * k, 0));
    const th = {};
    for (const t of THRESHOLDS[market]) { const ps = pmfs.map((p) => pOver(p, t)); const yy = ys.map((y) => (y > t ? 1 : 0)); th[t] = { logLoss: mean(ps.map((p, i) => -Math.log(yy[i] ? clamp(p) : 1 - clamp(p)))), auc: auc(ps, yy), overRate: mean(yy), meanP: mean(ps) }; }
    const pm = pmfs.map((p) => pOver(p, MAIN[market]));
    out.models[mod] = {
      countLogLoss: mean(nll), crps: mean(pmfs.map((p, i) => crps(p, ys[i]))), maeOfMean: mean(means.map((x, i) => Math.abs(x - ys[i]))), meanOfMean: mean(means),
      coverage80: mean(pmfs.map((p, i) => (quant(p, 0.1) <= ys[i] && ys[i] <= quant(p, 0.9) ? 1 : 0))),
      thresholds: th, calibrationAtMain: { threshold: MAIN[market], ...logistic(pm.map((p) => Math.log(clamp(p) / (1 - clamp(p)))), ys.map((y) => (y > MAIN[market] ? 1 : 0))) },
      _nll: nll,
    };
  }
  for (const mod of models) {
    if (mod === baseline) continue;
    const d = out.models[mod]._nll.map((x, i) => x - out.models[baseline]._nll[i]);
    out.vs[`${mod}-minus-${baseline}`] = { countLogLoss: mean(d), ci95: bootByDate(rows, d) };
  }
  if (models.includes("v1") && models.includes("v2")) { const d = out.models.v2._nll.map((x, i) => x - out.models.v1._nll[i]); out.vs["v2-minus-v1"] = { countLogLoss: mean(d), ci95: bootByDate(rows, d) }; }
  if (models.includes("v2h")) { const d = out.models.v2h._nll.map((x, i) => x - out.models.v2._nll[i]); out.vs["v2h-minus-v2"] = { countLogLoss: mean(d), ci95: bootByDate(rows, d) }; }
  for (const mod of models) delete out.models[mod]._nll;
  out.observedMean = mean(ys);
  return out;
}

const handRows = (rows) => rows.filter((r) => r.handKnown);
const report = {
  replay: "mlb-003-004 chronological box-score replay", season: Number(SEASON),
  label: HOLDOUT ? "RETROSPECTIVE_HOLDOUT (read once; not prospective; not sufficient for qualification)" : SEASON === "2026" ? "EXPOSED (2026 already examined; debugging/exploratory only)" : "DEVELOPMENT (exploratory)",
  gitHead: (() => { try { return execFileSync("git", ["-C", REPO, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { return null; } })(),
  scoredFrom: SCORE_FROM, dates: days.length, counts, handednessReference: Object.keys(hands).length ? path.relative(REPO, HANDS_FILE) : null,
  walkForward: params,
  pitcherStrikeouts: scoreMarket(kRows, "k", (r, m) => r.models[m], (r) => r.y, ["current", "v1", "v2"], "current"),
  pitcherStrikeoutsHandSubset: handRows(kRows).length ? scoreMarket(handRows(kRows), "k", (r, m) => r.models[m], (r) => r.y, ["current", "v1", "v2", "v2h"], "current") : null,
  batter: {}, batterHandSubset: {},
};
for (const mk of ["hits", "tb", "hrr"]) {
  report.batter[mk] = scoreMarket(bRows, mk, (r, m) => r.models[m][mk], (r) => r.y[mk], ["current", "v1", "v2"], "current");
  if (handRows(bRows).length) report.batterHandSubset[mk] = scoreMarket(handRows(bRows), mk, (r, m) => r.models[m][mk], (r) => r.y[mk], ["current", "v1", "v2", "v2h"], "current");
}
for (const mk of ["hr", "r", "rbi"]) { // no current-model counterpart: v2 against v1
  report.batter[mk] = scoreMarket(bRows, mk, (r, m) => r.models[m][mk], (r) => r.y[mk], ["v1", "v2"], "v1");
  if (handRows(bRows).length) report.batterHandSubset[mk] = scoreMarket(handRows(bRows), mk, (r, m) => r.models[m][mk], (r) => r.y[mk], ["v1", "v2", "v2h"], "v1");
}
// ── fidelity: the copied replay must reproduce the frozen 2024 replay exactly ──
const FROZEN = path.join(REPO, `docs/research/mlb/mlb-003-004/replay/replay-${SEASON}-${SEASON === "2026" ? "exposed" : "dev"}.json`);
const fidelity = { against: path.relative(REPO, FROZEN), checked: 0, mismatches: [] };
if (fs.existsSync(FROZEN)) {
  const fz = JSON.parse(fs.readFileSync(FROZEN, "utf8"));
  const cmp = (name, a, b) => { for (const [m, v] of Object.entries(b.models)) { fidelity.checked += 1; const x = a.models[m]?.countLogLoss; if (x == null || Math.abs(x - v.countLogLoss) > 1e-12) fidelity.mismatches.push(`${name}.${m}: ${x} vs ${v.countLogLoss}`); } if (a.n !== b.n) fidelity.mismatches.push(`${name}.n ${a.n} vs ${b.n}`); };
  cmp("k", report.pitcherStrikeouts, fz.pitcherStrikeouts);
  for (const mk of Object.keys(fz.batter)) cmp(mk, report.batter[mk], fz.batter[mk]);
} else fidelity.mismatches.push("frozen replay output not found");
fidelity.pass = fidelity.mismatches.length === 0;
console.log(`fidelity vs frozen replay: ${fidelity.pass ? "PASS" : "FAIL"} (${fidelity.checked} values)${fidelity.pass ? "" : " " + fidelity.mismatches.slice(0, 5).join("; ")}`);
if (!fidelity.pass) { console.error("REFUSED: the copied replay does not reproduce the frozen replay; no engine read-out is reported"); process.exit(3); }

// ── engine read-outs vs v2 analytic on identical rows ──
const diffCi = (rows, a, b) => { const d = rows.map((r) => r[a] - r[b]); return { countLogLoss: mean(d), ci95: bootByDate(rows, d) }; };
const nll = (p, y) => -Math.log(Math.max(1e-12, p[Math.min(y, p.length - 1)]));
const engineReport = {};
const decide = (o) => (engineAudit.violations === 0 && o.vs["engine-minus-v2"].ci95[1] <= 0.005 ? "PROCEED_TO_FORWARD_SHADOW" : "DO_NOT_PROCEED");
{
  const rows = kRows.filter((r) => r.engine);
  const o = scoreMarket(rows, "k", (r, m) => r.models[m], (r) => r.y, ["current", "v2", "v2inf", "engine"], "v2");
  const per = rows.map((r) => ({ date: r.date, e: nll(r.models.engine, r.y), i: nll(r.models.v2inf, r.y) }));
  o.vs["engine-minus-v2inf"] = diffCi(per, "e", "i");
  o.decision = decide(o);
  engineReport.k = o;
}
for (const mk of ["hits", "tb", "hrr", "hr", "r", "rbi"]) {
  const rows = bRows.filter((r) => r.engine);
  const models = ["hits", "tb", "hrr"].includes(mk) ? ["current", "v2", "v2inf", "engine"] : ["v2", "v2inf", "engine"];
  const o = scoreMarket(rows, mk, (r, m) => r.models[m][mk], (r) => r.y[mk], models, "v2");
  const per = rows.map((r) => ({ date: r.date, e: nll(r.models.engine[mk], r.y[mk]), i: nll(r.models.v2inf[mk], r.y[mk]) }));
  o.vs["engine-minus-v2inf"] = diffCi(per, "e", "i");
  o.decision = decide(o);
  engineReport[mk] = o;
}
// Game level (descriptive): winner log loss and total-runs log score / CRPS vs league-to-date baselines.
const llBin = (p, y) => -Math.log(y ? Math.min(1 - 1e-6, Math.max(1e-6, p)) : 1 - Math.min(1 - 1e-6, Math.max(1e-6, p)));
const gameLevel = gameRows.length ? {
  n: gameRows.length,
  winnerLogLoss: { engine: mean(gameRows.map((g) => llBin(g.engine.pHome, g.yHome))), leagueHomeRate: mean(gameRows.map((g) => llBin(g.base.pHome, g.yHome))) },
  totalRunsLogScore: { engine: mean(gameRows.map((g) => nll(g.engine.total, g.total))), leagueEmpirical: mean(gameRows.map((g) => nll(g.base.total, g.total))) },
  totalRunsCrps: { engine: mean(gameRows.map((g) => crps(g.engine.total, g.total))), leagueEmpirical: mean(gameRows.map((g) => crps(g.base.total, g.total))) },
  engineMinusLeague: {
    winner: diffCi(gameRows.map((g) => ({ date: g.date, a: llBin(g.engine.pHome, g.yHome), b: llBin(g.base.pHome, g.yHome) })), "a", "b"),
    totalLogScore: diffCi(gameRows.map((g) => ({ date: g.date, a: nll(g.engine.total, g.total), b: nll(g.base.total, g.total) })), "a", "b"),
  },
  meanTotal: { engine: mean(gameRows.map((g) => g.engine.total.reduce((a, p, k) => a + p * k, 0))), actual: mean(gameRows.map((g) => g.total)) },
  homeWinRate: { engine: mean(gameRows.map((g) => g.engine.pHome)), actual: mean(gameRows.map((g) => g.yHome)) },
} : null;
const subReport = {};
if (SUBST) {
  const decideSub = (o) => (engineAuditSub.violations === 0 && o.vs["engineSub-minus-v2"].ci95[1] <= 0.005 ? "PROCEED_TO_FORWARD_SHADOW" : "DO_NOT_PROCEED");
  const kr = kRows.filter((r) => r.engine && r.engineSub);
  { const o = scoreMarket(kr, "k", (r, m) => r.models[m], (r) => r.y, ["v2", "engine", "engineSub"], "v2"); o.vs["engineSub-minus-engine"] = diffCi(kr.map((r) => ({ date: r.date, a: nll(r.models.engineSub, r.y), b: nll(r.models.engine, r.y) })), "a", "b"); o.decision = decideSub(o); subReport.k = o; }
  const br = bRows.filter((r) => r.engine && r.engineSub);
  for (const mk of ["hits", "tb", "hrr", "hr", "r", "rbi"]) {
    const o = scoreMarket(br, mk, (r, m) => r.models[m][mk], (r) => r.y[mk], ["v2", "engine", "engineSub"], "v2");
    o.vs["engineSub-minus-engine"] = diffCi(br.map((r) => ({ date: r.date, a: nll(r.models.engineSub[mk], r.y[mk]), b: nll(r.models.engine[mk], r.y[mk]) })), "a", "b");
    o.decision = decideSub(o); subReport[mk] = o;
  }
  subReport.audit = { ...engineAuditSub, meanPaSimulated: engineAuditSub.paSim / engineAuditSub.nBat, meanPaActual: engineAuditSub.paAct / engineAuditSub.nBat, leagueHazardFinal: leagueHazard() };
  subReport.gameLevel = gameRowsSub.length ? { n: gameRowsSub.length, winnerLogLoss: mean(gameRowsSub.map((g) => llBin(g.engine.pHome, g.yHome))), totalRunsLogScore: mean(gameRowsSub.map((g) => nll(g.engine.total, g.total))), totalRunsCrps: mean(gameRowsSub.map((g) => crps(g.engine.total, g.total))), meanTotal: mean(gameRowsSub.map((g) => g.engine.total.reduce((a, p, k) => a + p * k, 0))) } : null;
}
// ── exploratory: posted lines (settled leans of record) ──
let lines = null;
if (LINES) {
  const jsonl = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const graded = jsonl("app/public/data/mlb/results/game-predictions-graded.jsonl");
  const MK = { pitcher_strikeouts: "k", batter_hits: "hits", batter_total_bases: "tb", batter_hits_runs_rbis: "hrr" };
  const leans = mlbLeansOfRecord(jsonl("pipeline/validation/mlb_settled_leans.jsonl"), { firstPitches: mlbFirstPitches(graded) }).record
    .filter((l) => MK[l.marketKey] && Number.isFinite(l.actual) && Number.isFinite(l.line) && l.actual !== l.line && Number.isFinite(l.modelProbOver) && l.playerId != null && l.date?.startsWith(SEASON));
  const boards = new Map();
  const boardRow = (date, id) => { if (!boards.has(date)) { let b = null; try { b = JSON.parse(fs.readFileSync(path.join(REPO, `app/public/data/mlb/boards/${date}.json`), "utf8")); } catch { b = null; } boards.set(date, b ? new Map((b.leans ?? []).map((x) => [x.id, x])) : null); } return boards.get(date)?.get(id) ?? null; };
  const implied = (o) => (o < 0 ? -o / (-o + 100) : 100 / (o + 100));
  const byKey = { k: new Map(kRows.filter((r) => r.engine).map((r) => [`${r.date}|${r.pid}`, r])), b: new Map(bRows.filter((r) => r.engine).map((r) => [`${r.date}|${r.pid}`, r])) };
  const llb = (p, y) => -Math.log(y ? Math.min(1 - 1e-6, Math.max(1e-6, p)) : 1 - Math.min(1 - 1e-6, Math.max(1e-6, p)));
  lines = { label: "EXPLORATORY — 2026 settled leans were examined repeatedly (baseline audit, v1 dev); no claim follows", byMarket: {} };
  for (const [mkKey, mk] of Object.entries(MK)) {
    const rows = [];
    for (const l of leans.filter((x) => x.marketKey === mkKey)) {
      const r = (mk === "k" ? byKey.k : byKey.b).get(`${l.date}|${l.playerId}`); if (!r) continue;
      const pmf = (m) => (mk === "k" ? r.models[m] : r.models[m]?.[mk]);
      const br = boardRow(l.date, l.id);
      const market = br && Number.isFinite(br.oddsOver) && Number.isFinite(br.oddsUnder) && br.projection === l.projection ? implied(br.oddsOver) / (implied(br.oddsOver) + implied(br.oddsUnder)) : null;
      const y = l.actual > l.line ? 1 : 0;
      const pr = { current: l.modelProbOver, v2: pOver(pmf("v2"), l.line), engine: pOver(pmf("engine"), l.line), ...(pmf("engineSub") ? { engineSub: pOver(pmf("engineSub"), l.line) } : {}), ...(mk === "k" && r.models.v3 ? { v3: pOver(r.models.v3, l.line) } : {}), market };
      rows.push({ date: l.date, y, pr });
    }
    const models = ["current", "v2", "engine", ...(rows.some((r) => r.pr.engineSub != null) ? ["engineSub"] : []), ...(rows.length && rows.every((r) => r.pr.v3 != null) ? ["v3"] : [])];
    const res = { n: rows.length, overRate: mean(rows.map((r) => r.y)), models: {}, vsCurrent: {}, vsMarket: {} };
    for (const m of models) { const ps = rows.map((r) => r.pr[m]); res.models[m] = { logLoss: mean(rows.map((r) => llb(r.pr[m], r.y))), auc: auc(ps, rows.map((r) => r.y)), calibration: logistic(ps.map((p) => Math.log(clamp(p) / (1 - clamp(p)))), rows.map((r) => r.y)) }; }
    for (const m of models.filter((x) => x !== "current")) { const d = rows.map((r) => llb(r.pr[m], r.y) - llb(r.pr.current, r.y)); res.vsCurrent[m] = { mean: mean(d), ci95: bootByDate(rows, d) }; }
    const mrows = rows.filter((r) => r.pr.market != null);
    res.marketN = mrows.length;
    if (mrows.length) { res.models.market = { logLoss: mean(mrows.map((r) => llb(r.pr.market, r.y))), auc: auc(mrows.map((r) => r.pr.market), mrows.map((r) => r.y)) }; for (const m of models) { const d = mrows.map((r) => llb(r.pr[m], r.y) - llb(r.pr.market, r.y)); res.vsMarket[m] = { mean: mean(d), ci95: bootByDate(mrows, d) }; } }
    lines.byMarket[mk] = res;
  }
}
// ── exploratory: error decomposition (opportunity vs rate vs distribution) ──
let decomposition = null;
if (DECOMPOSE) {
  const kr = kRows.filter((r) => r.dec);
  const br = bRows.filter((r) => r.dec);
  const nl = (p, y) => -Math.log(Math.max(1e-12, p[Math.min(y, p.length - 1)]));
  decomposition = {
    label: "EXPLORATORY — development season; what a perfectly known opportunity (actual BF / PA) would be worth",
    k: kr.length ? {
      n: kr.length,
      bf: { meanExpected: mean(kr.map((r) => r.dec.eBF)), meanActual: mean(kr.map((r) => r.dec.bfAct)), mae: mean(kr.map((r) => Math.abs(r.dec.eBF - r.dec.bfAct))) },
      kPerBf: { meanPredicted: mean(kr.map((r) => r.dec.p)), meanActual: kr.reduce((a, r) => a + r.y, 0) / Math.max(1, kr.reduce((a, r) => a + r.dec.bfAct, 0)) },
      countLogLoss: { v2: mean(kr.map((r) => nl(r.models.v2, r.y))), v2WithActualBF: mean(kr.map((r) => nl(r.dec.oracleBF, r.y))), binomialWithActualBF: mean(kr.map((r) => nl(r.dec.oracleBFbinom, r.y))) },
    } : null,
    batters: br.length ? Object.fromEntries(["hits", "tb", "hrr", "r", "rbi", "hr"].map((mk) => [mk, { n: br.length, v2: mean(br.map((r) => nl(r.models.v2[mk], r.y[mk]))), v2WithActualPA: mean(br.map((r) => nl(r.dec.oraclePA[mk], r.y[mk]))) }])) : null,
    pa: br.length ? { meanExpected: mean(br.map((r) => r.dec.ePA)), meanActual: mean(br.map((r) => r.dec.paAct)), mae: mean(br.map((r) => Math.abs(r.dec.ePA - r.dec.paAct))) } : null,
  };
}
let hfaReport = null;
if (HFA) {
  const pairs = gameRowsSub.map((g, i) => [g, gameRowsHfa[i]]).filter(([a, b]) => b && a.date === b.date && a.total === b.total && a.yHome === b.yHome);
  const ll = (p, y) => -Math.log(y ? Math.min(1 - 1e-6, Math.max(1e-6, p)) : 1 - Math.min(1 - 1e-6, Math.max(1e-6, p)));
  const nlT = (p, y) => -Math.log(Math.max(1e-12, p[Math.min(y, p.length - 1)]));
  const d = pairs.map(([a, b]) => ({ date: a.date, w: ll(b.engine.pHome, a.yHome) - ll(a.engine.pHome, a.yHome), t: nlT(b.engine.total, a.total) - nlT(a.engine.total, a.total) }));
  const winner = { mean: mean(d.map((x) => x.w)), ci95: bootByDate(d, d.map((x) => x.w)) };
  const players = {};
  for (const mk of ["k", "hits", "tb", "hrr", "hr", "r", "rbi"]) {
    const rows = (mk === "k" ? kRows : bRows).filter((r) => r.models.engineHfa && r.models.engineSub);
    const o = scoreMarket(rows, mk, (r, m) => (mk === "k" ? r.models[m] : r.models[m][mk]), (r) => (mk === "k" ? r.y : r.y[mk]), ["v2", "engineSub", "engineHfa"], "v2");
    o.decision = engineAuditHfa.violations === 0 && o.vs["engineHfa-minus-v2"].ci95[1] <= 0.005 ? "PROCEED_TO_FORWARD_SHADOW" : "DO_NOT_PROCEED";
    players[mk] = o;
  }
  hfaReport = { n: pairs.length, winnerMinusV2engine: winner, decision: winner.ci95[1] < 0 && engineAuditHfa.violations === 0 ? "PROCEED_TO_FORWARD_SHADOW" : "DO_NOT_PROCEED", totalLogScoreMinusV2engine: { mean: mean(d.map((x) => x.t)), ci95: bootByDate(d, d.map((x) => x.t)) },
    meanPHome: { v3: mean(pairs.map(([, b]) => b.engine.pHome)), v2: mean(pairs.map(([a]) => a.engine.pHome)), actual: mean(pairs.map(([a]) => a.yHome)) },
    winnerLogLoss: { v3: mean(pairs.map(([a, b]) => ll(b.engine.pHome, a.yHome))), v2: mean(pairs.map(([a]) => ll(a.engine.pHome, a.yHome))), league: mean(pairs.map(([a]) => ll(a.base.pHome, a.yHome))) },
    multipliersFinal: { home: hfaMult("home"), away: hfaMult("away") }, audit: engineAuditHfa, players };
}
let b2Report = null;
if (B2CHECK) {
  b2Report = { label: "EXPLORATORY — forward-B2 engine combination (frozen already; this cannot change it)", audit: engineAuditB2, markets: {} };
  for (const mk of ["k", "hits", "tb", "hrr", "hr", "r", "rbi"]) {
    const rows = (mk === "k" ? kRows : bRows).filter((r) => r.models.engineB2 && r.models.engineSub);
    const o = scoreMarket(rows, mk, (r, m) => (mk === "k" ? r.models[m] : r.models[m][mk]), (r) => (mk === "k" ? r.y : r.y[mk]), ["v2", "engineSub", "engineB2"], "engineSub");
    b2Report.markets[mk] = { n: o.n, engineB2MinusEngineSub: o.vs["engineB2-minus-engineSub"], v2MinusEngineSub: o.vs["v2-minus-engineSub"] };
  }
}
let kv3 = null;
if (KV3) {
  const rs = kRows.filter((r) => r.models.v3);
  const o = scoreMarket(rs, "k", (r, m) => r.models[m], (r) => r.y, ["v2", "v3"], "v2");
  const nl = (p, y) => -Math.log(Math.max(1e-12, p[Math.min(y, p.length - 1)]));
  const bySit = {};
  for (const sit of [...new Set(rs.map((r) => r.sit))]) { const x = rs.filter((r) => r.sit === sit); const d = x.map((r) => nl(r.models.v3, r.y) - nl(r.models.v2, r.y)); bySit[sit] = { n: x.length, v3MinusV2: mean(d), ci95: x.length > 30 ? bootByDate(x, d) : null }; }
  o.decision = o.vs["v3-minus-v2"].ci95[1] < 0 ? "PROCEED_TO_FORWARD_SHADOW" : "DO_NOT_PROCEED";
  kv3 = { label: "mlb-k-workload-v3 — exploratory development (2024 exposed by the residual exploration)", ...o, bySituation: bySit, deltas: v3Delta };
}
const out = {
  experiment: "mlb-coherent-worlds-v1", ...(kv3 ? { kWorkloadV3: kv3 } : {}),
  ...(process.argv.includes("--game-rows") ? { gameRowsDump: gameRows.map((g) => ({ gamePk: g.gamePk, date: g.date, yHome: g.yHome, total: g.total, pHomeV1: Number(g.engine.pHome.toFixed(4)), pHomeV2: Number((gameRowsSub.find((x) => x.gamePk === g.gamePk)?.engine.pHome ?? NaN).toFixed(4)) })) } : {}), ...(hfaReport ? { v3HomeField: hfaReport } : {}), ...(b2Report ? { b2Check: b2Report } : {}), ...(lines ? { exploratoryPostedLines: lines } : {}), ...(decomposition ? { exploratoryDecomposition: decomposition } : {}), ...(SUBST ? { v2Substitution: subReport } : {}), label: SEASON === "2026" ? "EXPOSED (debugging only)" : "DEVELOPMENT (exploratory; can only earn PROCEED_TO_FORWARD_SHADOW)",
  season: Number(SEASON), worldsPerGame: ENG_WORLDS, gitHead: report.gitHead, fidelity,
  engineAudit: { ...engineAudit, meanPaSimulated: engineAudit.paSim / engineAudit.nBat, meanPaActual: engineAudit.paAct / engineAudit.nBat },
  readouts: engineReport, gameLevel,
};
const OUT = path.join(HERE, `coherence-${SEASON}-${SEASON === "2026" ? "exposed" : "dev"}${SUBST ? "-v2-substitution" : ""}${LINES || DECOMPOSE ? "-exploratory" : ""}${KV3 ? "-kv3" : ""}${HFA ? "-v3-hfa" : ""}${process.argv.includes("--game-rows") ? "-gamerows" : ""}${B2CHECK ? "-b2check" : ""}.json`);
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
const f4 = (x) => (x == null ? "—" : x.toFixed(4));
console.log(`engine: ${engineAudit.games} games, ${engineAudit.worlds} worlds, ${engineAudit.violations} invariant violations, ${engineAudit.discarded} discarded at cap, skipped ${JSON.stringify(engineAudit.skipped)}, ${(engineAudit.ms / 1000).toFixed(0)} s; mean PA simulated ${f4(out.engineAudit.meanPaSimulated)} vs actual ${f4(out.engineAudit.meanPaActual)}`);
for (const [mk, o] of Object.entries(engineReport)) console.log(`${mk.padEnd(5)} n=${o.n} ` + Object.entries(o.models).map(([k, v]) => `${k} ${f4(v.countLogLoss)}`).join(" | ") + " || " + Object.entries(o.vs).map(([k, v]) => `${k} ${f4(v.countLogLoss)} [${f4(v.ci95[0])}, ${f4(v.ci95[1])}]`).join(" · ") + ` → ${o.decision}`);
if (gameLevel) console.log(`game n=${gameLevel.n}: winner LL engine ${f4(gameLevel.winnerLogLoss.engine)} vs league ${f4(gameLevel.winnerLogLoss.leagueHomeRate)}; total log score ${f4(gameLevel.totalRunsLogScore.engine)} vs ${f4(gameLevel.totalRunsLogScore.leagueEmpirical)}; CRPS ${f4(gameLevel.totalRunsCrps.engine)} vs ${f4(gameLevel.totalRunsCrps.leagueEmpirical)}; mean total ${f4(gameLevel.meanTotal.engine)} vs ${f4(gameLevel.meanTotal.actual)}`);
if (SUBST) {
  const a = subReport.audit;
  console.log(`v2 substitution: ${a.games} games, ${a.worlds} worlds, ${a.violations} invariant violations; mean PA simulated ${f4(a.meanPaSimulated)} vs actual ${f4(a.meanPaActual)}; hazard ${a.leagueHazardFinal.map((x) => x.toFixed(3)).join(" ")}`);
  for (const mk of ["k", "hits", "tb", "hrr", "hr", "r", "rbi"]) { const o = subReport[mk]; console.log(`${mk.padEnd(5)} n=${o.n} ` + Object.entries(o.models).map(([k, v]) => `${k} ${f4(v.countLogLoss)}`).join(" | ") + " || " + Object.entries(o.vs).map(([k, v]) => `${k} ${f4(v.countLogLoss)} [${f4(v.ci95[0])}, ${f4(v.ci95[1])}]`).join(" · ") + ` → ${o.decision}`); }
  if (subReport.gameLevel) console.log(`game (v2) n=${subReport.gameLevel.n}: winner LL ${f4(subReport.gameLevel.winnerLogLoss)} total log score ${f4(subReport.gameLevel.totalRunsLogScore)} CRPS ${f4(subReport.gameLevel.totalRunsCrps)} mean total ${f4(subReport.gameLevel.meanTotal)}`);
}
if (lines) for (const [mk, o] of Object.entries(lines.byMarket)) console.log(`LINES ${mk.padEnd(5)} n=${o.n} (market ${o.marketN}) ` + Object.entries(o.models).map(([k, v]) => `${k} LL ${f4(v.logLoss)} AUC ${f4(v.auc)}`).join(" | ") + " || vs current " + Object.entries(o.vsCurrent).map(([k, v]) => `${k} ${f4(v.mean)} [${f4(v.ci95[0])}, ${f4(v.ci95[1])}]`).join(" · ") + " || vs market " + Object.entries(o.vsMarket).map(([k, v]) => `${k} ${f4(v.mean)} [${f4(v.ci95[0])}, ${f4(v.ci95[1])}]`).join(" · "));
if (decomposition) console.log("DECOMPOSE " + JSON.stringify(decomposition));
if (hfaReport) { const h = hfaReport; console.log(`HFA n=${h.n}: winner LL v3 ${f4(h.winnerLogLoss.v3)} v2 ${f4(h.winnerLogLoss.v2)} league ${f4(h.winnerLogLoss.league)}; v3−v2 ${f4(h.winnerMinusV2engine.mean)} [${f4(h.winnerMinusV2engine.ci95[0])}, ${f4(h.winnerMinusV2engine.ci95[1])}] → ${h.decision}; total LS v3−v2 ${f4(h.totalLogScoreMinusV2engine.mean)} [${f4(h.totalLogScoreMinusV2engine.ci95[0])}, ${f4(h.totalLogScoreMinusV2engine.ci95[1])}]; P(home) v3 ${f4(h.meanPHome.v3)} v2 ${f4(h.meanPHome.v2)} actual ${f4(h.meanPHome.actual)}; violations ${h.audit.violations}; mult ${JSON.stringify(h.multipliersFinal)}`); for (const [mk, o] of Object.entries(h.players)) console.log(`  ${mk.padEnd(5)} engineHfa−v2 ${f4(o.vs["engineHfa-minus-v2"].countLogLoss)} [${f4(o.vs["engineHfa-minus-v2"].ci95[0])}, ${f4(o.vs["engineHfa-minus-v2"].ci95[1])}] engineSub−v2 ${f4(o.vs["engineSub-minus-v2"].countLogLoss)} → ${o.decision}`); }
if (b2Report) { console.log(`B2 check: violations ${b2Report.audit.violations}`); for (const [mk, o] of Object.entries(b2Report.markets)) console.log(`  B2 ${mk.padEnd(5)} n=${o.n} engineB2−engineSub ${f4(o.engineB2MinusEngineSub.countLogLoss)} [${f4(o.engineB2MinusEngineSub.ci95[0])}, ${f4(o.engineB2MinusEngineSub.ci95[1])}]`); }
if (kv3) { console.log(`K v3 n=${kv3.n} v2 ${f4(kv3.models.v2.countLogLoss)} v3 ${f4(kv3.models.v3.countLogLoss)} v3-minus-v2 ${f4(kv3.vs["v3-minus-v2"].countLogLoss)} [${f4(kv3.vs["v3-minus-v2"].ci95[0])}, ${f4(kv3.vs["v3-minus-v2"].ci95[1])}] → ${kv3.decision}; slope v3 ${f4(kv3.models.v3.calibrationAtMain.slope)}`); for (const [k, v] of Object.entries(kv3.bySituation)) console.log(`   ${k.padEnd(16)} n=${v.n} ${f4(v.v3MinusV2)} ${v.ci95 ? `[${f4(v.ci95[0])}, ${f4(v.ci95[1])}]` : ""}`); }
console.log(`→ ${path.relative(REPO, OUT)}`);
