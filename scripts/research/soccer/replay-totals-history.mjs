#!/usr/bin/env node
/**
 * SOCCER TEAM-SPECIFIC TOTALS — HISTORICAL WALK-FORWARD REPLAY ON OPENFOOTBALL (P305)
 *
 * Executes data/internal/research/epl/reports/epl-totals-replay-preregistration.json. Every constant, window and bar is
 * read from its `frozen` block. Data: the openfootball history tables (public domain) per league, hash-pinned.
 *
 * The live EPL model (P304 Elo-Poisson) sets every match's expected total to the league's trailing goals-per-match, so
 * P(over 2.5) is the same number for every fixture. This replay tests whether a club-specific total — built from each
 * club's decayed, shrunk goals-for and goals-against ratios — beats that constant, while the 1X2 side keeps P304's
 * goal-difference Elo supremacy unchanged.
 *
 *   --validate [--grid]   EPL DEV seasons only (2022-23 … 2025-26). A metric call on a non-dev row throws, and no league
 *                         other than the EPL is loaded. --grid sweeps the totals constants on dev and prints them.
 *   --score --now <ISO>   the ONE look. Refuses unless the registration is committed and unmodified, and refuses if the
 *                         evaluation file already exists. Those checks run FIRST.
 *
 * Held-out tiers (read from the registration):
 *   BLIND        Bundesliga, LaLiga, Serie A, Ligue 1 — seasons through 2021-22 that no model in this repository has
 *                ever scored (the 2026-09-11 expansion study scored 2023-24 onward; Dixon-Coles v2 is forward-only)
 *   SECOND_LOOK  EPL 2013-14 … 2021-22 — the P304 receipt already reports 1X2 log loss, ECE and over-2.5 Brier there
 *
 * Models (walk forward by UTC calendar day; a day's matches are predicted from one state fit strictly earlier):
 *   goalRatios   candidate — total = league rate × (att_home × def_away + att_away × def_home) / 2
 *   tempo        candidate — total = league rate × (tempo_home + tempo_away) / 2
 *   eloPoisson   control — P304 exactly (constant total = league trailing rate); its EPL figures must reproduce the receipt
 *   clubMeans    baseline — total = mean of the two clubs' own last-N match totals, unshrunk, undecayed
 * All four share P304's Elo supremacy and split: λ_home = (total + supremacy) / 2, λ_away = (total − supremacy) / 2.
 * Lives outside app/ on purpose: the Vercel ignore step builds only when app/ changes.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const PREREG_PATH = "data/internal/research/epl/reports/epl-totals-replay-preregistration.json";
const OUT_PATH = "data/internal/research/epl/reports/epl-totals-replay-evaluation.json";
const SELF = "scripts/research/soccer/replay-totals-history.mjs";

const argv = process.argv.slice(2);
const MODE = argv.includes("--score") ? "score" : argv.includes("--validate") ? "validate" : null;
const GRID = argv.includes("--grid");
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const refuse = (why) => { console.error(`REFUSED: ${why}`); process.exit(1); };
if (!MODE) refuse("usage: --validate [--grid] | --score --now <ISO>");
const NOW = argOf("--now");
let preregCommit = null;
if (MODE === "score") {
  if (!NOW || !Number.isFinite(Date.parse(NOW))) refuse("--now <ISO> required");
  if (fs.existsSync(rel(OUT_PATH))) refuse(`${OUT_PATH} already exists — the held-out set has been looked at once`);
  const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
  preregCommit = git("log", "-1", "--format=%H %cI", "--", PREREG_PATH);
  if (!preregCommit) refuse("the preregistration is not committed");
  try { git("diff", "--quiet", "HEAD", "--", PREREG_PATH); } catch { refuse("the preregistration has uncommitted changes"); }
}
const prereg = JSON.parse(fs.readFileSync(rel(PREREG_PATH), "utf8"));
const F = prereg.frozen;
const OUTCOMES = ["H", "D", "A"];
const seasonStart = (s) => Number(s.slice(0, 4));
const inSeasons = (s, [a, b]) => seasonStart(s) >= seasonStart(a) && seasonStart(s) <= seasonStart(b);
const CANDIDATES = ["goalRatios", "tempo"];
const MODELS = [...CANDIDATES, "eloPoisson", "clubMeans"];

// ── math ──────────────────────────────────────────────────────────────────────────────────────────
function lgamma(x) { let s = 0; for (let i = 2; i < x; i += 1) s += Math.log(i); return s; }
const poissonPmf = (k, lam) => Math.exp(-lam + k * Math.log(lam) - lgamma(k + 1));
/** Independent Poisson score grid to maxGoals per side, renormalised: 1X2, over lines and the total distribution. */
function matrixFrom(lamH, lamA) {
  const G = F.maxGoals;
  const ph = Array.from({ length: G + 1 }, (_, k) => poissonPmf(k, lamH));
  const pa = Array.from({ length: G + 1 }, (_, k) => poissonPmf(k, lamA));
  const totalDist = new Array(2 * G + 1).fill(0);
  let H = 0, D = 0, A = 0, mass = 0;
  for (let i = 0; i <= G; i += 1) for (let j = 0; j <= G; j += 1) {
    const p = ph[i] * pa[j];
    mass += p;
    if (i > j) H += p; else if (i === j) D += p; else A += p;
    totalDist[i + j] += p;
  }
  for (let k = 0; k < totalDist.length; k += 1) totalDist[k] /= mass;
  const over = (line) => totalDist.reduce((s, p, k) => (k > line ? s + p : s), 0);
  return { H: H / mass, D: D / mass, A: A / mass, over15: over(1), over25: over(2), over35: over(3), totalDist, meanTotal: lamH + lamA };
}
const gdMultiplier = (gd) => (gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8);

// ── one league's walk-forward ─────────────────────────────────────────────────────────────────────
/**
 * @param {object} L        the registration's league block (history path, warmup, heldOut, dev?, tier)
 * @param {object} T        totals constants per candidate { halfLifeMatches, priorMatches, seasonRegression } (frozen, or a grid point)
 * @param {boolean} devOnly validate mode: only dev-season rows are scored
 * @returns {Array} predictions with per-model probabilities
 */
function replayLeague(leagueKey, L, T, devOnly) {
  const history = JSON.parse(fs.readFileSync(rel(L.history), "utf8"));
  const lastPinned = L.dev ? L.dev[1] : L.heldOut[1];
  const pinnedRows = history.rows.filter((r) => inSeasons(r.season, [L.warmup[0], lastPinned]));
  const rowsSha = crypto.createHash("sha256").update(JSON.stringify(pinnedRows)).digest("hex");
  if (rowsSha !== L.historyRowsSha256) refuse(`${leagueKey}: registered-season rows hash ${rowsSha} does not match the registered ${L.historyRowsSha256}`);
  const matches = pinnedRows.filter((r) => Number.isInteger(r.ftHome) && Number.isInteger(r.ftAway))
    .sort((a, b) => a.dateUtc.localeCompare(b.dateUtc) || a.home.localeCompare(b.home));
  const isScored = (s) => (L.dev && inSeasons(s, L.dev)) || (!devOnly && inSeasons(s, L.heldOut));

  // P304 Elo state, verbatim
  const elo = new Map();
  const lastSeasonOf = new Map();
  const goalLog = [];
  const supremacyFit = { sxy: 0, sxx: 0 };
  let supremacySlope = null;
  let promotedRating = F.elo.start;
  // totals state, one per candidate: per club decayed sums for attack (goals for / league side rate), defence (goals
  // against / side rate) and tempo (match total / league rate), each shrunk toward 1 with priorMatches of weight
  const cands = Object.fromEntries(CANDIDATES.map((c) => [c, { rho: Math.pow(0.5, 1 / T[c].halfLifeMatches), prior: T[c].priorMatches, keep: 1 - T[c].seasonRegression, club: new Map() }]));
  const clubState = (K, c) => K.club.get(c) ?? K.club.set(c, { attS: 0, defS: 0, tmpS: 0, w: 0 }).get(c);
  const ratio = (K, S, w) => (K.prior + S) / (K.prior + w);
  const recentTotals = new Map(); // club → its own match totals, for the naive baseline
  const recentOf = (c) => recentTotals.get(c) ?? recentTotals.set(c, []).get(c);

  function beginSeason(season, clubsThisSeason) {
    const prevSeason = `${seasonStart(season) - 1}-${String(seasonStart(season)).slice(2)}`;
    const prevClubs = [...lastSeasonOf].filter(([, s]) => s === prevSeason).map(([c]) => c);
    if (prevClubs.length >= 3) {
      const bottom = prevClubs.map((c) => elo.get(c)).sort((a, b) => a - b).slice(0, 3);
      promotedRating = bottom.reduce((a, b) => a + b, 0) / 3;
    }
    for (const c of clubsThisSeason) {
      if (lastSeasonOf.get(c) !== prevSeason && elo.has(c)) elo.set(c, promotedRating);
      if (!elo.has(c)) elo.set(c, lastSeasonOf.size ? promotedRating : F.elo.start);
      elo.set(c, elo.get(c) + F.elo.seasonRegression * (F.elo.start - elo.get(c)));
      // totals: the season boundary discounts every club's evidence toward the league-average prior
      for (const K of Object.values(cands)) { const s = clubState(K, c); s.attS *= K.keep; s.defS *= K.keep; s.tmpS *= K.keep; s.w *= K.keep; }
    }
  }
  /** P304 verbatim: the league's goals per match over the previous window (the prior only before the first match). */
  function trailingGoalsPerMatch(dateUtc) {
    const cutoff = Date.parse(dateUtc);
    const recent = goalLog.filter((g) => Date.parse(g.dateUtc) < cutoff).slice(-F.totalWindowMatches);
    return recent.length ? recent.reduce((a, g) => a + g.goals, 0) / recent.length : F.totalPrior;
  }
  /** The normaliser for a club's evidence: the same window, with the prior standing in for matches not yet played. */
  function seededGoalsPerMatch(dateUtc) {
    const cutoff = Date.parse(dateUtc);
    const recent = goalLog.filter((g) => Date.parse(g.dateUtc) < cutoff).slice(-F.totalWindowMatches);
    return (recent.reduce((a, g) => a + g.goals, 0) + (F.totalWindowMatches - recent.length) * F.totalPrior) / F.totalWindowMatches;
  }

  const preds = [];
  const seasonsSeen = new Set();
  let i = 0;
  while (i < matches.length) {
    const day = matches[i].dateUtc.slice(0, 10);
    const slate = [];
    while (i < matches.length && matches[i].dateUtc.slice(0, 10) === day) slate.push(matches[i++]);
    for (const s of new Set(slate.map((m) => m.season))) {
      if (seasonsSeen.has(s)) continue;
      seasonsSeen.add(s);
      beginSeason(s, [...new Set(matches.filter((m) => m.season === s).flatMap((m) => [m.home, m.away]))]);
      if (!inSeasons(s, L.warmup) && supremacySlope == null) supremacySlope = supremacyFit.sxy / supremacyFit.sxx;
    }
    for (const m of slate) {
      if (!isScored(m.season)) continue;
      const dr = (elo.get(m.home) + F.elo.homeAdvantage - elo.get(m.away)) / 100;
      const league = trailingGoalsPerMatch(m.dateUtc);
      const sup = supremacySlope * dr;
      const G = cands.goalRatios, Tm = cands.tempo;
      const gh = clubState(G, m.home), ga = clubState(G, m.away), th = clubState(Tm, m.home), ta = clubState(Tm, m.away);
      const totals = {
        eloPoisson: league,
        goalRatios: league * (ratio(G, gh.attS, gh.w) * ratio(G, ga.defS, ga.w) + ratio(G, ga.attS, ga.w) * ratio(G, gh.defS, gh.w)) / 2,
        tempo: league * (ratio(Tm, th.tmpS, th.w) + ratio(Tm, ta.tmpS, ta.w)) / 2,
        clubMeans: (() => {
          const rh = recentOf(m.home).slice(-F.naive.window), ra = recentOf(m.away).slice(-F.naive.window);
          const mean = (xs) => (xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : league);
          return (mean(rh) + mean(ra)) / 2;
        })(),
      };
      const probs = {};
      for (const model of MODELS) if (!Number.isFinite(totals[model])) throw new Error(`${leagueKey} ${m.season} ${m.home} v ${m.away}: ${model} total ${totals[model]} (league ${league})`);
      for (const model of MODELS) {
        const t = totals[model];
        probs[model] = matrixFrom(Math.max(F.lambdaFloor, (t + sup) / 2), Math.max(F.lambdaFloor, (t - sup) / 2));
      }
      preds.push({ league: leagueKey, tier: L.tier, season: m.season, result: m.result, total: m.ftHome + m.ftAway, probs });
    }
    for (const m of slate) {
      const gd = m.ftHome - m.ftAway;
      const score = gd > 0 ? 1 : gd === 0 ? 0.5 : 0;
      const eH = elo.get(m.home), eA = elo.get(m.away);
      const dr = (eH + F.elo.homeAdvantage - eA) / 100;
      if (inSeasons(m.season, L.warmup)) { supremacyFit.sxy += dr * gd; supremacyFit.sxx += dr * dr; }
      const exp = 1 / (1 + Math.pow(10, -dr * 100 / 400));
      const k = F.elo.K * gdMultiplier(Math.abs(gd));
      elo.set(m.home, eH + k * (score - exp));
      elo.set(m.away, eA - k * (score - exp));
      lastSeasonOf.set(m.home, m.season);
      lastSeasonOf.set(m.away, m.season);
      // totals evidence, measured against the (prior-seeded) league rate that stood BEFORE this match
      const league = seededGoalsPerMatch(m.dateUtc);
      const side = league / 2;
      const tot = m.ftHome + m.ftAway;
      for (const [c, gf, ga] of [[m.home, m.ftHome, m.ftAway], [m.away, m.ftAway, m.ftHome]]) {
        for (const K of Object.values(cands)) {
          const s = clubState(K, c);
          s.attS = s.attS * K.rho + gf / side;
          s.defS = s.defS * K.rho + ga / side;
          s.tmpS = s.tmpS * K.rho + tot / league;
          s.w = s.w * K.rho + 1;
        }
        recentOf(c).push(tot);
      }
      goalLog.push({ dateUtc: m.dateUtc, season: m.season, goals: tot });
    }
  }
  return { preds, supremacySlope };
}

// ── metrics ───────────────────────────────────────────────────────────────────────────────────────
const LINES = [["over15", 1], ["over25", 2], ["over35", 3]];
function ece10(pairs) { // pairs of [p, outcome01]
  const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, o: 0 }));
  for (const [p, o] of pairs) { const b = bins[Math.min(9, Math.floor(p * 10))]; b.n += 1; b.p += p; b.o += o; }
  const n = pairs.length;
  return bins.reduce((s, b) => s + (b.n ? (b.n / n) * Math.abs(b.p / b.n - b.o / b.n) : 0), 0);
}
function metrics(list, model, devOnly) {
  if (devOnly && list.some((p) => p.tier !== "DEV")) throw new Error("a held-out row reached a metric in --validate");
  const n = list.length;
  if (!n) return null;
  let ll = 0, tll = 0, predTot = 0, actTot = 0;
  const brier = { over15: 0, over25: 0, over35: 0 };
  const rel = { over15: [], over25: [], over35: [] };
  const oneXTwo = [];
  const predTotals = [];
  for (const p of list) {
    const q = p.probs[model];
    ll -= Math.log(Math.max(1e-12, q[p.result]));
    tll -= Math.log(Math.max(1e-12, q.totalDist[Math.min(p.total, q.totalDist.length - 1)]));
    for (const o of OUTCOMES) oneXTwo.push([q[o], p.result === o ? 1 : 0]);
    for (const [key, line] of LINES) { const y = p.total > line ? 1 : 0; brier[key] += (q[key] - y) ** 2; rel[key].push([q[key], y]); }
    predTot += q.meanTotal; actTot += p.total; predTotals.push(q.meanTotal);
  }
  const meanPred = predTot / n;
  const sdPred = Math.sqrt(predTotals.reduce((s, x) => s + (x - meanPred) ** 2, 0) / n);
  return {
    n, logLoss: ll / n, ece: ece10(oneXTwo), totalLogLoss: tll / n,
    over15Brier: brier.over15 / n, over25Brier: brier.over25 / n, over35Brier: brier.over35 / n,
    over15Ece: ece10(rel.over15), over25Ece: ece10(rel.over25), over35Ece: ece10(rel.over35),
    level: meanPred / (actTot / n), meanPredictedTotal: meanPred, meanActualTotal: actTot / n, sdPredictedTotal: sdPred,
  };
}
const fmt = (m) => `n ${String(m.n).padStart(5)} · 1X2 LL ${m.logLoss.toFixed(4)} ECE ${m.ece.toFixed(4)} · total LL ${m.totalLogLoss.toFixed(5)} · O2.5 Brier ${m.over25Brier.toFixed(4)} ECE ${m.over25Ece.toFixed(4)} · O1.5/O3.5 ECE ${m.over15Ece.toFixed(3)}/${m.over35Ece.toFixed(3)} · level ${m.level.toFixed(3)} · sd ${m.sdPredictedTotal.toFixed(3)}`;

// ── --validate ────────────────────────────────────────────────────────────────────────────────────
if (MODE === "validate") {
  const L = F.leagues.epl;
  const run = (T) => replayLeague("epl", { ...L, tier: "DEV" }, T, true);
  if (GRID) {
    console.log("EPL DEV grid (constants → total log loss per candidate; lower is better; eloPoisson constant total shown once)");
    let shownControl = false;
    for (const halfLifeMatches of F.grid.halfLifeMatches) for (const priorMatches of F.grid.priorMatches) for (const seasonRegression of F.grid.seasonRegression) {
      const T = { halfLifeMatches, priorMatches, seasonRegression };
      const { preds } = run({ goalRatios: T, tempo: T });
      if (!shownControl) { console.log(`  eloPoisson  ${fmt(metrics(preds, "eloPoisson", true))}`); console.log(`  clubMeans   ${fmt(metrics(preds, "clubMeans", true))}`); shownControl = true; }
      for (const c of CANDIDATES) console.log(`  HL ${String(halfLifeMatches).padStart(3)} prior ${String(priorMatches).padStart(3)} reg ${seasonRegression}  ${c.padEnd(10)} ${fmt(metrics(preds, c, true))}`);
    }
    process.exit(0);
  }
  const { preds, supremacySlope } = run(F.totals);
  console.log(`supremacy slope (EPL warm-up only): ${supremacySlope.toFixed(4)} — P304 receipt 0.5851`);
  for (const season of [...new Set(preds.map((p) => p.season))].sort()) {
    for (const m of MODELS) console.log(`${season} ${m.padEnd(11)} ${fmt(metrics(preds.filter((p) => p.season === season), m, true))}`);
  }
  for (const m of MODELS) console.log(`DEV     ${m.padEnd(11)} ${fmt(metrics(preds, m, true))}`);
  process.exit(0);
}

// ── --score ───────────────────────────────────────────────────────────────────────────────────────
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const totalLossOf = (p, m) => -Math.log(Math.max(1e-12, p.probs[m].totalDist[Math.min(p.total, p.probs[m].totalDist.length - 1)]));
/** Block bootstrap of the mean per-match total log-loss difference (model − versus); blocks = league-season. */
function bootstrap(list, model, versus) {
  const blocks = [...new Set(list.map((p) => `${p.league}|${p.season}`))].sort();
  const agg = new Map(blocks.map((b) => [b, { sum: 0, n: 0 }]));
  for (const p of list) { const o = agg.get(`${p.league}|${p.season}`); o.sum += totalLossOf(p, model) - totalLossOf(p, versus); o.n += 1; }
  const rand = mulberry32(F.bootstrap.seed);
  const stats = [];
  for (let b = 0; b < F.bootstrap.resamples; b += 1) { let s = 0, n = 0; for (let k = 0; k < blocks.length; k += 1) { const o = agg.get(blocks[Math.floor(rand() * blocks.length)]); s += o.sum; n += o.n; } stats.push(s / n); }
  stats.sort((x, y) => x - y);
  return { versus, blocks: blocks.length, point: [...agg.values()].reduce((a, o) => a + o.sum, 0) / list.length, lo95: stats[Math.floor(0.025 * stats.length)], hi95: stats[Math.ceil(0.975 * stats.length) - 1] };
}

const all = [];
const slopes = {};
for (const [key, L] of Object.entries(F.leagues)) {
  const { preds, supremacySlope } = replayLeague(key, L, F.totals, false);
  slopes[key] = supremacySlope;
  all.push(...preds.filter((p) => inSeasons(p.season, L.heldOut)));
}
/* The control must be P304: its EPL held-out figures reproduce the committed receipt before any verdict is read. */
const p304 = JSON.parse(fs.readFileSync(rel(F.parity.p304Evaluation), "utf8"));
const eplHeld = all.filter((p) => p.league === "epl");
const eplControl = metrics(eplHeld, "eloPoisson", false);
const p304Control = (typeof p304.results === "string" ? JSON.parse(p304.results) : p304.results).eloPoisson.overall;
const parity = { supremacySlope: [slopes.epl, p304.supremacySlope], logLoss: [eplControl.logLoss, p304Control.logLoss], over25Brier: [eplControl.over25Brier, p304Control.over25Brier] };
const parityOk = Object.values(parity).every(([a, b]) => Math.abs(a - b) < 1e-4);
if (!parityOk) refuse(`the control does not reproduce the P304 receipt: ${JSON.stringify(parity)}`);

const bar = (pass, required, observed) => ({ pass: Boolean(pass), required, observed });
const groups = (list) => ({ overall: list, byLeague: Object.fromEntries([...new Set(list.map((p) => p.league))].sort().map((k) => [k, list.filter((p) => p.league === k)])) });
function judge(list, candidate, tierLabel, unitLabel) {
  const g = groups(list);
  const M = (l, m) => metrics(l, m, false);
  const C = M(g.overall, candidate);
  const better = ["eloPoisson", "clubMeans"].sort((a, b) => M(g.overall, a).totalLogLoss - M(g.overall, b).totalLogLoss)[0];
  const boot = bootstrap(g.overall, candidate, better);
  const units = Object.entries(g.byLeague);
  const bars = {
    beatsConstantAndClubMeans: bar(["eloPoisson", "clubMeans"].every((b) => C.totalLogLoss < M(g.overall, b).totalLogLoss && units.every(([, l]) => M(l, candidate).totalLogLoss < M(l, b).totalLogLoss)),
      `total-goals log loss below the constant-total control and the club-means baseline, overall and in every ${unitLabel}`,
      Object.fromEntries(["eloPoisson", "clubMeans"].map((b) => [b, { overall: [C.totalLogLoss, M(g.overall, b).totalLogLoss], [unitLabel]: Object.fromEntries(units.map(([k, l]) => [k, [M(l, candidate).totalLogLoss, M(l, b).totalLogLoss]])) }]))),
    improvementIsNotNoise: bar(boot.hi95 < 0, `${F.bootstrap.unit}-block bootstrap 95% upper bound of the per-match total log-loss difference versus the better baseline < 0`, boot),
    overLinesCalibrated: bar(["over15Ece", "over25Ece", "over35Ece"].every((k) => C[k] <= F.bars.overEceMax), `over 1.5 / 2.5 / 3.5 reliability ECE each <= ${F.bars.overEceMax}`, { over15Ece: C.over15Ece, over25Ece: C.over25Ece, over35Ece: C.over35Ece }),
    level: bar(C.level >= F.bars.levelBand[0] && C.level <= F.bars.levelBand[1], `mean predicted total / mean actual total within [${F.bars.levelBand}]`, C.level),
    oneXTwoNotWorse: bar(C.logLoss <= M(g.overall, "eloPoisson").logLoss + F.bars.oneXTwoTolerance && C.ece <= F.bars.oneXTwoEceMax, `1X2 log loss at most ${F.bars.oneXTwoTolerance} above the P304 control overall and 1X2 ECE <= ${F.bars.oneXTwoEceMax}`, { logLoss: [C.logLoss, M(g.overall, "eloPoisson").logLoss], ece: C.ece }),
    minimumN: bar(C.n >= F.bars.minimumN, `n >= ${F.bars.minimumN}`, C.n),
  };
  const pass = Object.values(bars).every((b) => b.pass);
  return { tier: tierLabel, verdict: pass ? (tierLabel === "BLIND" ? "ELIGIBLE" : "SECOND_LOOK_ELIGIBLE") : (tierLabel === "BLIND" ? "REJECTED" : "SECOND_LOOK_REJECTED"), bars, failed: Object.entries(bars).filter(([, b]) => !b.pass).map(([k]) => k) };
}
const blind = all.filter((p) => p.tier === "BLIND");
const second = all.filter((p) => p.tier === "SECOND_LOOK");
const eplEras = Object.fromEntries(F.leagues.epl.eras.map(([a, b]) => [`${a}..${b}`, second.filter((p) => inSeasons(p.season, [a, b]))]));
const results = {};
for (const m of MODELS) {
  results[m] = {
    blind: { overall: metrics(blind, m, false), byLeague: Object.fromEntries(Object.entries(groups(blind).byLeague).map(([k, l]) => [k, metrics(l, m, false)])) },
    secondLook: { overall: metrics(second, m, false), eras: Object.fromEntries(Object.entries(eplEras).map(([k, l]) => [k, metrics(l, m, false)])), seasons: Object.fromEntries([...new Set(second.map((p) => p.season))].sort().map((s) => [s, metrics(second.filter((p) => p.season === s), m, false)])) },
  };
}
const verdicts = {};
for (const c of CANDIDATES) {
  // the EPL second look is judged with its two eras as the units, the blind set with its four leagues
  const eraList = second.map((p) => ({ ...p, league: Object.keys(eplEras).find((k) => eplEras[k].includes(p)) }));
  verdicts[c] = { blind: judge(blind, c, "BLIND", "league"), secondLook: judge(eraList, c, "SECOND_LOOK", "era") };
}
/* Decision rule: a candidate is proposed only if BLIND is ELIGIBLE and the EPL second look is SECOND_LOOK_ELIGIBLE;
   among such candidates the lower blind total log loss is proposed, ties to the simpler tempo model. */
const proposable = CANDIDATES.filter((c) => verdicts[c].blind.verdict === "ELIGIBLE" && verdicts[c].secondLook.verdict === "SECOND_LOOK_ELIGIBLE");
const proposed = proposable.sort((a, b) => (results[a].blind.overall.totalLogLoss - results[b].blind.overall.totalLogLoss) || (a === "tempo" ? -1 : 1))[0] ?? null;
const receipt = {
  schemaVersion: 1, artifact: "epl-totals-replay-evaluation", dataClass: "PRIVATE_RESEARCH", program: "305", generatedAt: NOW,
  preregistration: { path: PREREG_PATH, commit: preregCommit },
  scriptSha256: crypto.createHash("sha256").update(fs.readFileSync(rel(SELF))).digest("hex"),
  supremacySlopes: slopes, controlParity: { pass: parityOk, ...parity },
  population: { blind: Object.fromEntries(Object.entries(groups(blind).byLeague).map(([k, l]) => [k, l.length])), blindTotal: blind.length, secondLook: second.length },
  results, verdicts, proposed,
  consequence: "Nothing publishes from this receipt. Changing the live EPL totals is its own reviewed, founder-approved app/ step with a blind forward test; the P304 model stays the control.",
};
fs.writeFileSync(rel(OUT_PATH), JSON.stringify(receipt, (_k, v) => (typeof v === "number" && !Number.isInteger(v) ? Number(v.toFixed(5)) : v), 1), { flag: "wx" });
console.log(`control parity with the P304 receipt: ${parityOk ? "ok" : "FAILED"} ${JSON.stringify(parity)}`);
for (const m of MODELS) console.log(`BLIND        ${m.padEnd(11)} ${fmt(results[m].blind.overall)}`);
for (const m of MODELS) console.log(`SECOND_LOOK  ${m.padEnd(11)} ${fmt(results[m].secondLook.overall)}`);
for (const c of CANDIDATES) console.log(`${c.padEnd(11)} blind ${verdicts[c].blind.verdict} (failed: ${verdicts[c].blind.failed.join(", ") || "none"}) · EPL second look ${verdicts[c].secondLook.verdict} (failed: ${verdicts[c].secondLook.failed.join(", ") || "none"})`);
console.log(`proposed: ${proposed ?? "none"}`);
