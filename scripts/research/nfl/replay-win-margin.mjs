#!/usr/bin/env node
/**
 * NFL WIN + MARGIN HEADS — HISTORICAL WALK-FORWARD REPLAY (P297)
 *
 * Executes data/internal/research/nfl/reports/win-margin-historical-replay-preregistration.json. Every
 * constant that shapes a prediction, grid or bar is read from that file's `frozen` block.
 *
 *   --validate            DEV seasons only (2022–2025): dev fits, grid traces, the implementation check.
 *                         No held-out metric is computed; a metric call on a held-out row throws.
 *   --score --now <ISO>   the ONE look at held-out 2006–2021. Refuses unless the registration is committed
 *                         and unmodified, and refuses if the evaluation file already exists.
 *
 * Lives outside app/ on purpose: the Vercel ignore step builds only when app/ changes.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const PREREG_PATH = "data/internal/research/nfl/reports/win-margin-historical-replay-preregistration.json";
const OUT_PATH = "data/internal/research/nfl/reports/win-margin-historical-replay-evaluation.json";
const GAMES_PATH = "data/internal/research/nfl/raw/nflverse/games.csv";

const argv = process.argv.slice(2);
const MODE = argv.includes("--score") ? "score" : argv.includes("--validate") ? "validate" : null;
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const refuse = (why) => { console.error(`REFUSED: ${why}`); process.exit(1); };
if (!MODE) refuse("usage: --validate | --score --now <ISO>");

const prereg = JSON.parse(fs.readFileSync(rel(PREREG_PATH), "utf8"));
const F = prereg.frozen;
const bytes = fs.readFileSync(rel(GAMES_PATH));
if (crypto.createHash("sha256").update(bytes).digest("hex") !== F.inputs.gamesCsvSha256) refuse("games.csv does not match the registered hash");

// ── inputs ────────────────────────────────────────────────────────────────────────────────────────
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i += 1; } else quoted = false; } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out;
}
const franchise = (t) => F.franchiseMap[t] ?? t;
const inSeasons = (s, [a, b]) => s >= a && s <= b;
const lines = bytes.toString("utf8").replace(/\r/g, "").trim().split("\n");
const header = parseCsvLine(lines[0]);
const col = Object.fromEntries(header.map((h, i) => [h, i]));
const games = [];
for (const line of lines.slice(1)) {
  const r = parseCsvLine(line);
  if (r.length !== header.length) refuse(`malformed games.csv row: ${line.slice(0, 60)}`);
  const season = Number(r[col.season]);
  if (season < F.seasons.warmup[0] || season > F.seasons.dev[1]) continue;
  if (r[col.home_score] === "" || r[col.away_score] === "") continue;
  const ml = (v) => (v === "" ? null : Number(v));
  games.push({
    id: r[col.game_id], season, date: r[col.gameday],
    home: franchise(r[col.home_team]), away: franchise(r[col.away_team]),
    neutral: r[col.location] === "Neutral",
    hs: Number(r[col.home_score]), as: Number(r[col.away_score]),
    mlHome: ml(r[col.home_moneyline]), mlAway: ml(r[col.away_moneyline]),
  });
}
games.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.id < b.id ? -1 : 1));

/** No-vig home probability — lib/projection-framework.ts noVigTwoWay, mirrored (proportional). */
const implied = (odds) => (odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100));
const marketHome = (g) => {
  if (g.mlHome == null || g.mlAway == null || g.mlHome === 0 || g.mlAway === 0) return null;
  const a = implied(g.mlHome);
  const b = implied(g.mlAway);
  return a + b > 0 ? a / (a + b) : null;
};

// ── the Elo engine: one recurrence, parameterised ─────────────────────────────────────────────────
const { mean: MEAN, seasonRegression: REG } = F.incumbent;
/**
 * @returns per-game pre-game records { i, d, p } in input order, for the rows `keep` selects.
 */
function runElo({ rows, K, hfa, neutralZero, mov, keep = () => true }) {
  const elo = new Map();
  const get = (t) => elo.get(t) ?? MEAN;
  const out = new Map();
  let lastSeason = null;
  for (let i = 0; i < rows.length;) {
    let j = i;
    while (j < rows.length && rows[j].date === rows[i].date) j += 1;
    const season = rows[i].season;
    if (lastSeason !== null && season !== lastSeason) for (const [t, r] of elo) elo.set(t, r + (MEAN - r) * REG);
    lastSeason = season;
    const day = [];
    for (let k = i; k < j; k += 1) {
      const g = rows[k];
      const h = neutralZero && g.neutral ? 0 : hfa;
      const d = get(g.home) + h - get(g.away);
      const p = 1 / (1 + 10 ** (-d / 400));
      day.push({ k, g, d, p });
      if (keep(g)) out.set(k, { d, p });
    }
    for (const { g, d, p } of day) {
      if (g.hs === g.as) continue;
      const s = g.hs > g.as ? 1 : 0;
      let step = K;
      if (mov) {
        const winnerEdge = s ? d : -d;
        step = K * Math.log(Math.abs(g.hs - g.as) + 1) * (2.2 / (winnerEdge * 0.001 + 2.2));
      }
      elo.set(g.home, get(g.home) + step * (s - p));
      elo.set(g.away, get(g.away) + step * ((1 - s) - (1 - p)));
    }
    i = j;
  }
  return out;
}

// ── metrics (held-out rows only reach these in --score) ───────────────────────────────────────────
const EPS = F.probabilityClamp;
const clamp = (p) => Math.min(1 - EPS, Math.max(EPS, p));
const ll = (p, y) => -(y ? Math.log(clamp(p)) : Math.log(1 - clamp(p)));
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const guard = (rows) => {
  if (MODE === "validate" && rows.some((r) => !inSeasons(r.season, F.seasons.dev))) throw new Error("a held-out row reached a metric in --validate");
};
function winMetrics(rows, pOf) {
  guard(rows);
  const dec = rows.filter((r) => r.hs !== r.as && pOf(r) != null);
  if (!dec.length) return null;
  const ys = dec.map((r) => (r.hs > r.as ? 1 : 0));
  const ps = dec.map((r) => pOf(r));
  const bins = Array.from({ length: F.eceBins }, () => ({ n: 0, p: 0, y: 0 }));
  ps.forEach((p, i) => { const b = bins[Math.min(F.eceBins - 1, Math.floor(p * F.eceBins))]; b.n += 1; b.p += p; b.y += ys[i]; });
  const ece = bins.reduce((s, b) => s + (b.n ? (b.n / ps.length) * Math.abs(b.p / b.n - b.y / b.n) : 0), 0);
  return {
    decisive: dec.length,
    ties: rows.filter((r) => r.hs === r.as).length,
    logLoss: avg(ps.map((p, i) => ll(p, ys[i]))),
    brier: avg(ps.map((p, i) => (p - ys[i]) ** 2)),
    ece,
  };
}
function marginMetrics(rows, dOf, slope, sigma) {
  guard(rows);
  if (!rows.length) return null;
  const errs = rows.map((r) => (r.hs - r.as) - slope * dOf(r));
  return { n: rows.length, mae: avg(errs.map(Math.abs)), coverage80: avg(errs.map((e) => (Math.abs(e) <= F.z80 * sigma ? 1 : 0))) };
}

// ── dev fits (2022–2025 only) ─────────────────────────────────────────────────────────────────────
const isDev = (g) => inSeasons(g.season, F.seasons.dev);
const devRows = games.filter(isDev);
function devLogLoss(preds) {
  const dec = devRows.map((g) => ({ g, idx: games.indexOf(g) })).filter(({ g }) => g.hs !== g.as);
  return avg(dec.map(({ g, idx }) => ll(preds.get(idx).p, g.hs > g.as ? 1 : 0)));
}
const indexOf = new Map(games.map((g, i) => [g, i]));
const devIdx = devRows.map((g) => indexOf.get(g));
const devLL = (preds) => avg(devIdx.filter((i) => games[i].hs !== games[i].as).map((i) => ll(preds.get(i).p, games[i].hs > games[i].as ? 1 : 0)));
void devLogLoss;
function fitMargin(preds) {
  const obs = devIdx.map((i) => ({ d: preds.get(i).d, m: games[i].hs - games[i].as }));
  const slope = obs.reduce((s, o) => s + o.d * o.m, 0) / obs.reduce((s, o) => s + o.d * o.d, 0);
  const res = obs.map((o) => o.m - slope * o.d);
  return { slope, sigma: Math.sqrt(res.reduce((s, r) => s + r * r, 0) / (res.length - 1)) };
}

const keepAll = (g) => g.season >= F.seasons.heldOut[0];
const trace = { eloMov: [], eloHfaRefit: [], marketBlend: [] };
let bestMov = null;
for (const K of F.grids.K) for (const hfa of F.grids.homeAdvantage) {
  const preds = runElo({ rows: games, K, hfa, neutralZero: true, mov: true, keep: keepAll });
  const v = devLL(preds);
  trace.eloMov.push({ K, homeAdvantage: hfa, devLogLoss: v });
  if (!bestMov || v < bestMov.v) bestMov = { K, hfa, v };
}
let bestHfa = null;
for (const hfa of F.grids.homeAdvantage) {
  const preds = runElo({ rows: games, K: F.incumbent.K, hfa, neutralZero: true, mov: false, keep: keepAll });
  const v = devLL(preds);
  trace.eloHfaRefit.push({ homeAdvantage: hfa, devLogLoss: v });
  if (!bestHfa || v < bestHfa.v) bestHfa = { hfa, v };
}

const incPreds = runElo({ rows: games, K: F.incumbent.K, hfa: F.incumbent.homeAdvantage, neutralZero: false, mov: false, keep: keepAll });
const movPreds = runElo({ rows: games, K: bestMov.K, hfa: bestMov.hfa, neutralZero: true, mov: true, keep: keepAll });
const hfaPreds = runElo({ rows: games, K: F.incumbent.K, hfa: bestHfa.hfa, neutralZero: true, mov: false, keep: keepAll });
const logit = (p) => Math.log(clamp(p) / (1 - clamp(p)));
const blendP = (i, w) => {
  const m = marketHome(games[i]);
  if (m == null) return incPreds.get(i).p;
  return 1 / (1 + Math.exp(-(w * logit(incPreds.get(i).p) + (1 - w) * logit(m))));
};
let bestW = null;
const devPriced = devIdx.filter((i) => games[i].hs !== games[i].as && marketHome(games[i]) != null);
for (const w of F.grids.blendW) {
  const v = avg(devPriced.map((i) => ll(blendP(i, w), games[i].hs > games[i].as ? 1 : 0)));
  trace.marketBlend.push({ w, devLogLoss: v });
  if (!bestW || v < bestW.v) bestW = { w, v };
}
const movMargin = fitMargin(movPreds);
const hfaMargin = fitMargin(hfaPreds);
const fits = {
  eloMov: { K: bestMov.K, homeAdvantage: bestMov.hfa, marginSlope: movMargin.slope, sigmaMargin: movMargin.sigma },
  eloHfaRefit: { K: F.incumbent.K, homeAdvantage: bestHfa.hfa, marginSlope: hfaMargin.slope, sigmaMargin: hfaMargin.sigma },
  marketBlend: { w: bestW.w },
};

/* Per-game records carry every predictor's pre-game numbers, so any slice is scored on identical games. */
const records = games.map((g, i) => (keepAll(g) ? {
  season: g.season, hs: g.hs, as: g.as,
  inc: incPreds.get(i), mov: movPreds.get(i), hfa: hfaPreds.get(i),
  blend: blendP(i, bestW.w), market: marketHome(g),
} : null)).filter(Boolean);

const PRED = {
  incumbent: { p: (r) => r.inc.p, d: (r) => r.inc.d, slope: F.incumbent.marginSlope, sigma: F.incumbent.sigmaMargin },
  eloMov: { p: (r) => r.mov.p, d: (r) => r.mov.d, slope: fits.eloMov.marginSlope, sigma: fits.eloMov.sigmaMargin },
  eloHfaRefit: { p: (r) => r.hfa.p, d: (r) => r.hfa.d, slope: fits.eloHfaRefit.marginSlope, sigma: fits.eloHfaRefit.sigmaMargin },
  marketBlend: { p: (r) => r.blend },
  market: { p: (r) => r.market },
};
const r5 = (_k, v) => (typeof v === "number" && !Number.isInteger(v) ? Number(v.toFixed(5)) : v);

// ── --validate ────────────────────────────────────────────────────────────────────────────────────
if (MODE === "validate") {
  const dev = records.filter((r) => inSeasons(r.season, F.seasons.dev));
  console.log("dev fits:", JSON.stringify(fits, r5));
  console.log("grid traces:", JSON.stringify(trace, r5));
  for (const s of [2022, 2023, 2024, 2025]) {
    const rows = dev.filter((r) => r.season === s);
    const line = Object.entries(PRED).map(([k, p]) => {
      const w = winMetrics(rows, p.p);
      const m = p.d ? marginMetrics(rows, p.d, p.slope, p.sigma) : null;
      return `${k}: ll ${w?.logLoss.toFixed(4)} ece ${w?.ece.toFixed(3)}${m ? ` mae ${m.mae.toFixed(2)} cov ${m.coverage80.toFixed(3)}` : ""}`;
    });
    console.log(`\n${s} (dev) · ${rows.length} games\n  ${line.join("\n  ")}`);
  }
  /* The receipt folded ESPN corpus rows from 2023 only; replay the incumbent the same way and score 2025. */
  const from2023 = games.filter((g) => g.season >= 2023);
  const p2023 = runElo({ rows: from2023, K: F.incumbent.K, hfa: F.incumbent.homeAdvantage, neutralZero: false, mov: false });
  const dec25 = from2023.map((g, i) => ({ g, i })).filter(({ g }) => g.season === 2025 && g.hs !== g.as);
  const ll25 = avg(dec25.map(({ g, i }) => ll(p2023.get(i).p, g.hs > g.as ? 1 : 0)));
  console.log(`\nimplementation check: incumbent folding from 2023, 2025 log loss ${ll25.toFixed(4)} (receipt ${prereg.implementationCheck.logLoss2025})`);
  process.exit(0);
}

// ── --score: the one look ─────────────────────────────────────────────────────────────────────────
const NOW = argOf("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) refuse("--now <ISO> required");
if (fs.existsSync(rel(OUT_PATH))) refuse(`${OUT_PATH} already exists — the held-out set has been looked at once`);
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
const preregCommit = git("log", "-1", "--format=%H %cI", "--", PREREG_PATH);
if (!preregCommit) refuse("the preregistration is not committed");
try { git("diff", "--quiet", "HEAD", "--", PREREG_PATH); } catch { refuse("the preregistration has uncommitted changes"); }

const held = records.filter((r) => inSeasons(r.season, F.seasons.heldOut));
const eras = F.eras.map(([a, b]) => ({ key: `${a}-${b}`, rows: held.filter((r) => inSeasons(r.season, [a, b])) }));
const priced = held.filter((r) => r.market != null);
const seasonsOf = (rows) => [...new Set(rows.map((r) => r.season))].sort((a, b) => a - b);

const results = {};
for (const [k, p] of Object.entries(PRED)) {
  const rows = k === "market" ? priced : held;
  results[k] = {
    win: { overall: winMetrics(rows, p.p), eras: Object.fromEntries(eras.map((e) => [e.key, winMetrics(k === "market" ? e.rows.filter((r) => r.market != null) : e.rows, p.p)])), seasons: Object.fromEntries(seasonsOf(rows).map((s) => [s, winMetrics(rows.filter((r) => r.season === s), p.p)])), onPricedGames: winMetrics(priced, p.p) },
    ...(p.d ? { margin: { overall: marginMetrics(held, p.d, p.slope, p.sigma), eras: Object.fromEntries(eras.map((e) => [e.key, marginMetrics(e.rows, p.d, p.slope, p.sigma)])) } } : {}),
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Season-block bootstrap of mean(log loss of A − log loss of B) over decisive games both scored. */
function bootstrap(rows, pA, pB) {
  const dec = rows.filter((r) => r.hs !== r.as && pA(r) != null && pB(r) != null);
  const seasons = seasonsOf(dec);
  const agg = new Map(seasons.map((s) => [s, { sum: 0, n: 0 }]));
  for (const r of dec) { const y = r.hs > r.as ? 1 : 0; const o = agg.get(r.season); o.sum += ll(pA(r), y) - ll(pB(r), y); o.n += 1; }
  const rand = mulberry32(F.bootstrap.seed);
  const stats = [];
  for (let b = 0; b < F.bootstrap.resamples; b += 1) {
    let sum = 0; let n = 0;
    for (let k = 0; k < seasons.length; k += 1) { const o = agg.get(seasons[Math.floor(rand() * seasons.length)]); sum += o.sum; n += o.n; }
    stats.push(sum / n);
  }
  stats.sort((x, y) => x - y);
  return { point: [...agg.values()].reduce((s, o) => s + o.sum, 0) / dec.length, lo95: stats[Math.floor(0.025 * stats.length)], hi95: stats[Math.ceil(0.975 * stats.length) - 1] };
}

const B = F.bars;
const inc = results.incumbent;
const bar = (pass, required, observed) => ({ pass: Boolean(pass), required, observed });
const comparisons = { incumbentVsMarket: bootstrap(priced, PRED.incumbent.p, PRED.market.p) };
const bars = {};
const verdicts = {};
for (const k of ["eloMov", "eloHfaRefit", "marketBlend"]) {
  const c = results[k];
  comparisons[k] = bootstrap(held, PRED[k].p, PRED.incumbent.p);
  const win = {
    logLossImprovement: bar(inc.win.overall.logLoss - c.win.overall.logLoss >= B.logLossImprovement, `at least ${B.logLossImprovement} below ${inc.win.overall.logLoss}`, c.win.overall.logLoss),
    improvementIsNotNoise: bar(comparisons[k].hi95 < 0, "season-bootstrap 95% upper bound < 0", comparisons[k]),
    everyEra: bar(eras.every((e) => c.win.eras[e.key].logLoss < inc.win.eras[e.key].logLoss), "below the incumbent in every era", Object.fromEntries(eras.map((e) => [e.key, { candidate: c.win.eras[e.key].logLoss, incumbent: inc.win.eras[e.key].logLoss }]))),
    marketHardStop: bar(c.win.onPricedGames.logLoss - results.market.win.overall.logLoss < B.marketHardStop, `less than ${B.marketHardStop} above the market's ${results.market.win.overall.logLoss}`, c.win.onPricedGames.logLoss),
    calibration: bar(c.win.overall.ece <= inc.win.overall.ece + B.eceTolerance, `ECE <= ${inc.win.overall.ece} + ${B.eceTolerance}`, c.win.overall.ece),
  };
  bars[k] = { win };
  verdicts[k] = { win: Object.values(win).every((x) => x.pass) ? "ELIGIBLE" : "REJECTED" };
  if (c.margin) {
    const [lo, hi] = B.coverageBand;
    const inBand = (m) => m.coverage80 >= lo && m.coverage80 <= hi;
    const margin = {
      coverageBand: bar(inBand(c.margin.overall) && eras.every((e) => inBand(c.margin.eras[e.key])), `[${lo}, ${hi}] overall and in every era`, { overall: c.margin.overall.coverage80, eras: Object.fromEntries(eras.map((e) => [e.key, c.margin.eras[e.key].coverage80])) }),
      mae: bar(c.margin.overall.mae <= inc.margin.overall.mae + B.maeTolerance, `<= ${inc.margin.overall.mae} + ${B.maeTolerance}`, c.margin.overall.mae),
    };
    bars[k].margin = margin;
    verdicts[k].margin = Object.values(margin).every((x) => x.pass) ? "ELIGIBLE" : "REJECTED";
  } else {
    verdicts[k].margin = "UNCHANGED_INCUMBENT";
  }
}
const [cLo, cHi] = B.coverageBand;
const incumbentMarginInBand = inc.margin.overall.coverage80 >= cLo && inc.margin.overall.coverage80 <= cHi;
const winFinalists = Object.keys(verdicts).filter((k) => verdicts[k].win === "ELIGIBLE").sort((a, b) => results[a].win.overall.logLoss - results[b].win.overall.logLoss);
const marginFinalists = Object.keys(verdicts).filter((k) => verdicts[k].margin === "ELIGIBLE").sort((a, b) => results[a].margin.overall.mae - results[b].margin.overall.mae);

const receipt = {
  schemaVersion: 1,
  artifact: "win-margin-historical-replay-evaluation",
  dataClass: "PRIVATE_RESEARCH",
  program: "297",
  generatedAt: NOW,
  preregistration: { path: PREREG_PATH, commit: preregCommit },
  scriptSha256: crypto.createHash("sha256").update(fs.readFileSync(fileURLToPath(import.meta.url))).digest("hex"),
  population: { heldOutSeasons: F.seasons.heldOut, heldOutGames: held.length, heldOutDecisive: held.filter((r) => r.hs !== r.as).length, heldOutTies: held.filter((r) => r.hs === r.as).length, heldOutWithBothMoneylines: priced.length },
  devFits: fits,
  gridTraces: trace,
  results,
  comparisons,
  incumbentMarginCoverageInBand: incumbentMarginInBand,
  bars,
  verdicts,
  recommendation: {
    win: winFinalists[0] ?? "incumbent",
    margin: marginFinalists[0] ?? "incumbent",
    note: winFinalists[0] === "marketBlend" ? "the recommended win head is MARKET-INFORMED — publishing it is the founder's product decision" : null,
  },
  consequence: "Nothing publishes from this receipt. Adoption into PUBLIC_EXPERIMENTAL forecasts is its own reviewed step; labelling beyond that stays with the frozen regular-season contract unless the founder decides otherwise.",
};
fs.writeFileSync(rel(OUT_PATH), JSON.stringify(receipt, r5, 1), { flag: "wx" });
for (const k of ["incumbent", "eloMov", "eloHfaRefit", "marketBlend", "market"]) {
  const w = results[k].win.overall;
  const m = results[k].margin?.overall;
  console.log(`${k.padEnd(12)} ll ${w.logLoss.toFixed(4)} brier ${w.brier.toFixed(4)} ece ${w.ece.toFixed(3)}${m ? ` · margin mae ${m.mae.toFixed(2)} cov ${m.coverage80.toFixed(3)}` : ""}${verdicts[k] ? ` · win ${verdicts[k].win} · margin ${verdicts[k].margin}` : ""}`);
}
console.log(`recommendation: win ${receipt.recommendation.win} · margin ${receipt.recommendation.margin}`);
