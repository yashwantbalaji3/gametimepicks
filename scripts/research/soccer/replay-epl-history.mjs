#!/usr/bin/env node
/**
 * EPL MATCH MODEL — HISTORICAL WALK-FORWARD REPLAY ON OPENFOOTBALL (P304)
 *
 * Executes data/internal/research/epl/reports/epl-history-replay-preregistration.json. Every constant, window and bar
 * is read from its `frozen` block. Data: data/internal/research/soccer/epl/history-openfootball-v1.json (openfootball,
 * public domain), hash-pinned.
 *
 *   --validate            DEV seasons only (2022-23 … 2025-26). A metric call on a non-dev row throws.
 *   --score --now <ISO>   the ONE look at held-out 2013-14 … 2021-22. Refuses unless the registration is committed and
 *                         unmodified, and refuses if the evaluation file already exists. Those checks run FIRST.
 *
 * Models (walk forward by UTC calendar day; a day's matches are predicted from one state fit strictly earlier):
 *   eloPoisson   candidate — goal-difference-weighted Elo sets the expected goal supremacy, a trailing league scoring
 *                rate sets the total, independent Poisson gives the full score matrix (1X2, totals, BTTS)
 *   poissonLive  control — the live EPL library (fitEplStrength + scoreMatrix, committed defaults) fit on the live rule's
 *                window: the three previous seasons plus the current season to date
 *   elo          baseline — the league backtest's plain Elo (K 20, home +60, draw = running draw rate)
 *   uniform      baseline — 1/3 each
 * Lives outside app/ on purpose: the Vercel ignore step builds only when app/ changes.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fitEplStrength, scoreMatrix } from "../../../app/src/lib/sports/epl/strength-state.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const PREREG_PATH = "data/internal/research/epl/reports/epl-history-replay-preregistration.json";
const OUT_PATH = "data/internal/research/epl/reports/epl-history-replay-evaluation.json";
const HISTORY_PATH = "data/internal/research/soccer/epl/history-openfootball-v1.json";

const argv = process.argv.slice(2);
const MODE = argv.includes("--score") ? "score" : argv.includes("--validate") ? "validate" : null;
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const refuse = (why) => { console.error(`REFUSED: ${why}`); process.exit(1); };
if (!MODE) refuse("usage: --validate | --score --now <ISO>");
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
const history = JSON.parse(fs.readFileSync(rel(HISTORY_PATH), "utf8"));
const OUTCOMES = ["H", "D", "A"];
const seasonStart = (s) => Number(s.slice(0, 4));
const inSeasons = (s, [a, b]) => seasonStart(s) >= seasonStart(a) && seasonStart(s) <= seasonStart(b);
/* The history file refreshes daily with the current season; only the registered seasons are pinned. */
const pinnedRows = history.rows.filter((r) => inSeasons(r.season, [F.seasons.warmup[0], F.seasons.dev[1]]));
const rowsSha = crypto.createHash("sha256").update(JSON.stringify(pinnedRows)).digest("hex");
if (rowsSha !== F.inputs.historyRowsSha256) refuse(`registered-season rows hash ${rowsSha} does not match the registered ${F.inputs.historyRowsSha256}`);
const matches = history.rows.filter((r) => inSeasons(r.season, [F.seasons.warmup[0], F.seasons.dev[1]]))
  .sort((a, b) => a.dateUtc.localeCompare(b.dateUtc) || a.home.localeCompare(b.home));
const isScored = (s) => inSeasons(s, F.seasons.heldOut) || inSeasons(s, F.seasons.dev);

// ── candidate state ───────────────────────────────────────────────────────────────────────────────
const elo = new Map();
const plainElo = new Map();
const lastSeasonOf = new Map();
const tally = { H: 0, D: 0, A: 0 };
const goalLog = []; // { dateUtc, season, goals }
const supremacyFit = { sxy: 0, sxx: 0 }; // least squares through the origin of goal difference on rating difference (warm-up only)
let supremacySlope = null;

const poissonPmf = (k, lam) => Math.exp(-lam + k * Math.log(lam) - lgamma(k + 1));
function lgamma(x) { let s = 0; for (let i = 2; i < x; i += 1) s += Math.log(i); return s; }
function matrixFrom(lamH, lamA) {
  const G = F.maxGoals;
  let H = 0, D = 0, A = 0, over25 = 0;
  const ph = Array.from({ length: G + 1 }, (_, k) => poissonPmf(k, lamH));
  const pa = Array.from({ length: G + 1 }, (_, k) => poissonPmf(k, lamA));
  let mass = 0;
  for (let i = 0; i <= G; i += 1) for (let j = 0; j <= G; j += 1) {
    const p = ph[i] * pa[j];
    mass += p;
    if (i > j) H += p; else if (i === j) D += p; else A += p;
    if (i + j > 2) over25 += p;
  }
  return { H: H / mass, D: D / mass, A: A / mass, over25: over25 / mass };
}
const gdMultiplier = (gd) => (gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8);

/** A promoted (or returning) club enters at the mean end-of-season rating of the previous season's bottom three. */
let promotedRating = F.elo.start;
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
    // season boundary: regress every club a fraction toward the league mean
    elo.set(c, elo.get(c) + F.elo.seasonRegression * (F.elo.start - elo.get(c)));
  }
}
function trailingGoalsPerMatch(dateUtc) {
  const cutoff = Date.parse(dateUtc) - 0;
  const recent = goalLog.filter((g) => Date.parse(g.dateUtc) < cutoff).slice(-F.totalWindowMatches);
  return recent.length ? recent.reduce((a, g) => a + g.goals, 0) / recent.length : F.totalPrior;
}

// ── the replay ────────────────────────────────────────────────────────────────────────────────────
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
    if (!inSeasons(s, F.seasons.warmup) && supremacySlope == null) supremacySlope = supremacyFit.sxy / supremacyFit.sxx;
  }
  const scoredSlate = slate.filter((m) => isScored(m.season));
  let liveState = null;
  if (scoredSlate.length) {
    const season = scoredSlate[0].season;
    const windowRows = matches.filter((m) => seasonStart(m.season) >= seasonStart(season) - F.control.previousSeasons && m.dateUtc < `${day}T00:00:00Z`);
    liveState = fitEplStrength({ rows: windowRows, cutoffIso: `${day}T00:00:00Z` });
  }
  for (const m of scoredSlate) {
    const n = tally.H + tally.D + tally.A;
    const drawRate = (tally.D + 1) / (n + 3);
    const dr = (elo.get(m.home) + F.elo.homeAdvantage - elo.get(m.away)) / 100;
    const total = trailingGoalsPerMatch(m.dateUtc);
    const sup = supremacySlope * dr;
    const cand = matrixFrom(Math.max(F.lambdaFloor, (total + sup) / 2), Math.max(F.lambdaFloor, (total - sup) / 2));
    const live = scoreMatrix(liveState, m.home, m.away);
    const pe = (plainElo.get(m.home) ?? F.elo.start) + F.plainElo.homeAdvantage;
    const expH = 1 / (1 + Math.pow(10, ((plainElo.get(m.away) ?? F.elo.start) - pe) / 400));
    preds.push({
      season: m.season, result: m.result, over25: m.ftHome + m.ftAway > 2 ? 1 : 0,
      probs: {
        eloPoisson: { H: cand.H, D: cand.D, A: cand.A, over25: cand.over25 },
        poissonLive: { H: live.oneXTwo.home, D: live.oneXTwo.draw, A: live.oneXTwo.away, over25: live.totals?.over25 ?? null },
        elo: { H: (1 - drawRate) * expH, D: drawRate, A: (1 - drawRate) * (1 - expH), over25: null },
        uniform: { H: 1 / 3, D: 1 / 3, A: 1 / 3, over25: null },
      },
    });
  }
  for (const m of slate) {
    tally[m.result] += 1;
    const gd = m.ftHome - m.ftAway;
    const score = gd > 0 ? 1 : gd === 0 ? 0.5 : 0;
    const eH = elo.get(m.home), eA = elo.get(m.away);
    const dr = (eH + F.elo.homeAdvantage - eA) / 100;
    if (inSeasons(m.season, F.seasons.warmup)) { supremacyFit.sxy += dr * gd; supremacyFit.sxx += dr * dr; }
    const exp = 1 / (1 + Math.pow(10, -dr * 100 / 400));
    const k = F.elo.K * gdMultiplier(Math.abs(gd));
    elo.set(m.home, eH + k * (score - exp));
    elo.set(m.away, eA - k * (score - exp));
    const pH = plainElo.get(m.home) ?? F.elo.start, pA = plainElo.get(m.away) ?? F.elo.start;
    const pexp = 1 / (1 + Math.pow(10, (pA - (pH + F.plainElo.homeAdvantage)) / 400));
    plainElo.set(m.home, pH + F.plainElo.K * (score - pexp));
    plainElo.set(m.away, pA - F.plainElo.K * (score - pexp));
    lastSeasonOf.set(m.home, m.season);
    lastSeasonOf.set(m.away, m.season);
    goalLog.push({ dateUtc: m.dateUtc, season: m.season, goals: m.ftHome + m.ftAway });
  }
}

// ── metrics ───────────────────────────────────────────────────────────────────────────────────────
const MODELS = ["eloPoisson", "poissonLive", "elo", "uniform"];
const isDev = (p) => inSeasons(p.season, F.seasons.dev);
function metrics(list, model) {
  if (MODE === "validate" && list.some((p) => !isDev(p))) throw new Error("a held-out row reached a metric in --validate");
  const n = list.length;
  if (!n) return null;
  let ll = 0, rps = 0, o25 = 0, o25n = 0;
  const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, o: 0 }));
  for (const p of list) {
    const q = p.probs[model];
    ll -= Math.log(Math.max(1e-12, q[p.result]));
    rps += ((q.H - (p.result === "H" ? 1 : 0)) ** 2 + (q.H + q.D - (p.result === "A" ? 0 : 1)) ** 2) / 2;
    for (const o of OUTCOMES) { const b = bins[Math.min(9, Math.floor(q[o] * 10))]; b.n += 1; b.p += q[o]; b.o += p.result === o ? 1 : 0; }
    if (q.over25 != null) { o25 += (q.over25 - p.over25) ** 2; o25n += 1; }
  }
  return { n, logLoss: ll / n, rps: rps / n, ece: bins.reduce((s, b) => s + (b.n ? (b.n / (3 * n)) * Math.abs(b.p / b.n - b.o / b.n) : 0), 0), over25Brier: o25n ? o25 / o25n : null };
}
const fmt = (m) => `n ${m.n} · LL ${m.logLoss.toFixed(4)} · RPS ${m.rps.toFixed(4)} · ECE ${m.ece.toFixed(4)} · O2.5 Brier ${m.over25Brier == null ? "—" : m.over25Brier.toFixed(4)}`;

if (MODE === "validate") {
  console.log(`supremacy slope (goals per 100 rating points, fit on warm-up only): ${supremacySlope.toFixed(4)}`);
  const dev = preds.filter(isDev);
  for (const season of [...new Set(dev.map((p) => p.season))].sort()) {
    for (const m of MODELS) console.log(`${season} ${m.padEnd(12)} ${fmt(metrics(dev.filter((p) => p.season === season), m))}`);
  }
  for (const m of MODELS) console.log(`DEV     ${m.padEnd(12)} ${fmt(metrics(dev, m))}`);
  process.exit(0);
}

// ── --score ───────────────────────────────────────────────────────────────────────────────────────
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const lossOf = (p, m) => -Math.log(Math.max(1e-12, p.probs[m][p.result]));
function bootstrap(list, model, versus) {
  const seasons = [...new Set(list.map((p) => p.season))].sort();
  const agg = new Map(seasons.map((s) => [s, { sum: 0, n: 0 }]));
  for (const p of list) { const o = agg.get(p.season); o.sum += lossOf(p, model) - lossOf(p, versus); o.n += 1; }
  const rand = mulberry32(F.bootstrap.seed);
  const stats = [];
  for (let b = 0; b < F.bootstrap.resamples; b += 1) { let s = 0, n = 0; for (let k = 0; k < seasons.length; k += 1) { const o = agg.get(seasons[Math.floor(rand() * seasons.length)]); s += o.sum; n += o.n; } stats.push(s / n); }
  stats.sort((x, y) => x - y);
  return { versus, point: [...agg.values()].reduce((a, o) => a + o.sum, 0) / list.length, lo95: stats[Math.floor(0.025 * stats.length)], hi95: stats[Math.ceil(0.975 * stats.length) - 1] };
}
const held = preds.filter((p) => inSeasons(p.season, F.seasons.heldOut));
const eras = Object.fromEntries(F.eras.map(([a, b]) => [`${a}..${b}`, held.filter((p) => inSeasons(p.season, [a, b]))]));
const results = Object.fromEntries(MODELS.map((m) => [m, { overall: metrics(held, m), eras: Object.fromEntries(Object.entries(eras).map(([k, l]) => [k, metrics(l, m)])), seasons: Object.fromEntries([...new Set(held.map((p) => p.season))].sort().map((s) => [s, metrics(held.filter((p) => p.season === s), m)])) }]));
const C = results.eloPoisson;
const better = ["poissonLive", "elo"].sort((a, b) => results[a].overall.logLoss - results[b].overall.logLoss)[0];
const boot = bootstrap(held, "eloPoisson", better);
const bar = (pass, required, observed) => ({ pass: Boolean(pass), required, observed });
const bars = {
  beatsControlAndElo: bar(["poissonLive", "elo"].every((b) => C.overall.logLoss < results[b].overall.logLoss && Object.keys(eras).every((k) => C.eras[k].logLoss < results[b].eras[k].logLoss)), "log loss below the live-rule Poisson and plain Elo, overall and in each era", Object.fromEntries(["poissonLive", "elo"].map((b) => [b, { overall: [C.overall.logLoss, results[b].overall.logLoss], eras: Object.fromEntries(Object.keys(eras).map((k) => [k, [C.eras[k].logLoss, results[b].eras[k].logLoss]])) }]))),
  improvementIsNotNoise: bar(boot.hi95 < 0, "season-bootstrap 95% upper bound of the per-match log-loss difference versus the better of the two < 0", boot),
  calibration: bar(C.overall.ece <= F.bars.eceMax, `1X2 ECE <= ${F.bars.eceMax}`, C.overall.ece),
  totalsNotWorse: bar(C.overall.over25Brier <= results.poissonLive.overall.over25Brier, "over-2.5 Brier not worse than the live-rule Poisson", [C.overall.over25Brier, results.poissonLive.overall.over25Brier]),
  minimumN: bar(C.overall.n >= F.bars.minimumN, `n >= ${F.bars.minimumN}`, C.overall.n),
};
const verdict = Object.values(bars).every((b) => b.pass) ? "ELIGIBLE" : "REJECTED";
const receipt = { schemaVersion: 1, artifact: "epl-history-replay-evaluation", dataClass: "PRIVATE_RESEARCH", program: "304", generatedAt: NOW, preregistration: { path: PREREG_PATH, commit: preregCommit }, scriptSha256: crypto.createHash("sha256").update(fs.readFileSync(rel("scripts/research/soccer/replay-epl-history.mjs"))).digest("hex"), supremacySlope, results, bars, verdict, consequence: "Nothing publishes from this receipt. Changing the live EPL model is its own reviewed, founder-approved app/ step." };
fs.writeFileSync(rel(OUT_PATH), JSON.stringify(receipt, (_k, v) => (typeof v === "number" && !Number.isInteger(v) ? Number(v.toFixed(5)) : v), 1), { flag: "wx" });
for (const m of MODELS) console.log(`${m.padEnd(12)} ${fmt(results[m].overall)}`);
console.log(`verdict ${verdict} · failed: ${Object.entries(bars).filter(([, b]) => !b.pass).map(([k]) => k).join(", ") || "none"}`);
