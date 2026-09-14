#!/usr/bin/env node
/**
 * NFL MATCHUP TOTALS — HISTORICAL WALK-FORWARD REPLAY (P295)
 *
 * Executes data/internal/research/nfl/reports/matchup-totals-historical-replay-preregistration.json.
 * Every constant below that shapes a prediction is read from that file's `frozen` block; this script
 * only carries out what it says.
 *
 *   --validate            DEV seasons only (2022–2025): implementation checks, the dev fits, and input
 *                         completeness. No accuracy figure for a held-out season is computed or printed.
 *   --score --now <ISO>   the ONE look at held-out 2000–2021. Refuses unless the preregistration is
 *                         committed and unmodified, and refuses if the evaluation file already exists.
 *
 * Every candidate learns game by game: ratings fold in each date's finals before the next date's
 * games are predicted, exactly as they would run live week to week.
 *
 * Lives outside app/ on purpose: the Vercel ignore step builds only when app/ changes, so committing
 * research never triggers a deploy.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const PREREG_PATH = "data/internal/research/nfl/reports/matchup-totals-historical-replay-preregistration.json";
const OUT_PATH = "data/internal/research/nfl/reports/matchup-totals-historical-replay-evaluation.json";
const GAMES_PATH = "data/internal/research/nfl/raw/nflverse/games.csv";
const EFF_PATH = "data/internal/research/nfl/replay/team-game-efficiency-v1.json";

const argv = process.argv.slice(2);
const MODE = argv.includes("--score") ? "score" : argv.includes("--validate") ? "validate" : null;
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const refuse = (why) => { console.error(`REFUSED: ${why}`); process.exit(1); };
if (!MODE) refuse("usage: --validate | --score --now <ISO>");

const prereg = JSON.parse(fs.readFileSync(rel(PREREG_PATH), "utf8"));
const F = prereg.frozen;
const sha256 = (p) => crypto.createHash("sha256").update(fs.readFileSync(rel(p))).digest("hex");
if (sha256(GAMES_PATH) !== F.inputs.gamesCsvSha256) refuse("games.csv does not match the registered hash");
if (sha256(EFF_PATH) !== F.inputs.efficiencyTableSha256) refuse("efficiency table does not match the registered hash");

// ---- inputs ------------------------------------------------------------------------------------
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
const inSeasons = (season, [a, b]) => season >= a && season <= b;
const [firstSeason] = F.seasons.warmup;
const lastSeason = F.seasons.dev[1];

const csv = fs.readFileSync(rel(GAMES_PATH), "utf8").replace(/\r/g, "").trim().split("\n");
const header = parseCsvLine(csv[0]);
const col = Object.fromEntries(header.map((h, i) => [h, i]));
const games = [];
for (const line of csv.slice(1)) {
  const r = parseCsvLine(line);
  if (r.length !== header.length) refuse(`games.csv row has ${r.length} fields, header has ${header.length}: ${line.slice(0, 60)}`);
  const season = Number(r[col.season]);
  if (season < firstSeason || season > lastSeason) continue;
  if (r[col.home_score] === "" || r[col.away_score] === "") continue;
  games.push({
    id: r[col.game_id],
    season,
    date: r[col.gameday],
    time: r[col.gametime] ?? "",
    home: franchise(r[col.home_team]),
    away: franchise(r[col.away_team]),
    y: Number(r[col.home_score]) + Number(r[col.away_score]),
    line: r[col.total_line] === "" ? null : Number(r[col.total_line]),
  });
}
games.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.time !== b.time ? (a.time < b.time ? -1 : 1) : a.id < b.id ? -1 : 1));

const eff = JSON.parse(fs.readFileSync(rel(EFF_PATH), "utf8"));
const effBy = new Map(eff.rows.map((r) => [`${r.gameId}|${r.team}`, r]));

// ---- walk-forward replay -----------------------------------------------------------------------
const alpha = 1 - Math.exp(Math.log(0.5) / F.halfLifeGames);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const R = new Map(); // team -> decayed (points for + against) per game — the v1 recurrence
const EFF = new Map(); // team -> decayed { oE, dE, pl }
let allSum = 0;
let allN = 0;
const records = [];

for (let i = 0; i < games.length;) {
  let j = i;
  while (j < games.length && games[j].date === games[i].date) j += 1;
  const day = games.slice(i, j);

  // Pre-game: everything below reads state built from STRICTLY EARLIER dates only.
  const seed = allN ? allSum / allN : F.seedLeagueMean;
  const L = R.size ? mean([...R.values()]) : seed;
  const effNow = [...EFF.values()];
  const LoE = effNow.length ? mean(effNow.map((v) => v.oE)) : 0;
  const LdE = effNow.length ? mean(effNow.map((v) => v.dE)) : 0;
  const Lpl = effNow.length ? mean(effNow.map((v) => v.pl)) : 0;
  const devOf = (v, key, league) => (v ? v[key] - league : 0);

  for (const g of day) {
    const s = ((R.get(g.home) ?? seed) + (R.get(g.away) ?? seed)) / 2;
    const eh = EFF.get(g.home);
    const ea = EFF.get(g.away);
    records.push({
      id: g.id,
      season: g.season,
      y: g.y,
      line: g.line,
      L,
      S: s - L,
      E: devOf(eh, "oE", LoE) + devOf(ea, "dE", LdE) + devOf(ea, "oE", LoE) + devOf(eh, "dE", LdE),
      Pl: devOf(eh, "pl", Lpl) + devOf(ea, "pl", Lpl),
      v1: F.incumbent.a0 + F.incumbent.a1 * (s - F.incumbent.meanRatingTrain),
      v2: L + F.incumbent.a1 * (s - L),
      effReady: Boolean(eh && ea),
    });
  }

  // Fold the whole date in.
  for (const g of day) {
    for (const t of [g.home, g.away]) {
      const r = R.get(t) ?? seed;
      R.set(t, r + alpha * (g.y - r));
    }
    allSum += g.y;
    allN += 1;
  }
  for (const g of day) {
    for (const t of [g.home, g.away]) {
      const row = effBy.get(`${g.id}|${t}`);
      if (!row || !row.oPlays || !row.dPlays) continue;
      const obs = { oE: row.oEpa / row.oPlays, dE: row.dEpa / row.dPlays, pl: row.oPlays };
      const prev = EFF.get(t) ?? (effNow.length ? { oE: LoE, dE: LdE, pl: Lpl } : obs);
      EFF.set(t, {
        oE: prev.oE + alpha * (obs.oE - prev.oE),
        dE: prev.dE + alpha * (obs.dE - prev.dE),
        pl: prev.pl + alpha * (obs.pl - prev.pl),
      });
    }
  }
  i = j;
}

const devRows = records.filter((r) => inSeasons(r.season, F.seasons.dev));
const heldOutRows = records.filter((r) => inSeasons(r.season, F.seasons.heldOut));

// ---- dev fits (2022–2025 only) -----------------------------------------------------------------
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k += 1) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

function devFits(rows) {
  if (rows.some((r) => !inSeasons(r.season, F.seasons.dev))) throw new Error("a dev fit was handed a non-dev season");
  const priced = rows.filter((r) => r.line != null);
  const sigmaMarket = Math.sqrt(priced.reduce((s, r) => s + (r.y - r.line) ** 2, 0) / (priced.length - 1));

  let sxz = 0;
  let sxx = 0;
  for (const r of priced) { const x = r.line - r.v2; sxz += x * (r.y - r.v2); sxx += x * x; }
  const w = sxz / sxx;
  const sigmaBlend = Math.sqrt(priced.reduce((s, r) => s + (r.y - (r.v2 + w * (r.line - r.v2))) ** 2, 0) / (priced.length - 1));

  const X = rows.map((r) => [r.S, r.E, r.Pl]);
  const z = rows.map((r) => r.y - r.L);
  const XtX = [0, 1, 2].map((a) => [0, 1, 2].map((b) => X.reduce((s, x) => s + x[a] * x[b], 0)));
  const Xtz = [0, 1, 2].map((a) => X.reduce((s, x, i) => s + x[a] * z[i], 0));
  const c = solve(XtX, Xtz);
  const resid = X.map((x, i) => z[i] - (c[0] * x[0] + c[1] * x[1] + c[2] * x[2]));
  const sigmaV3 = Math.sqrt(resid.reduce((s, e) => s + e * e, 0) / (rows.length - 3));
  const inv = [0, 1, 2].map((k) => solve(XtX, [0, 1, 2].map((m) => (m === k ? 1 : 0))));
  const se = [0, 1, 2].map((k) => sigmaV3 * Math.sqrt(inv[k][k]));

  return {
    games: rows.length,
    pricedGames: priced.length,
    marketClose: { sigma: sigmaMarket },
    v2MarketBlend: { w, sigma: sigmaBlend },
    v3PlayEfficiency: { cS: c[0], cE: c[1], cPlays: c[2], stdErr: { cS: se[0], cE: se[1], cPlays: se[2] }, sigma: sigmaV3 },
  };
}
const fit = devFits(devRows);

const PREDICTORS = {
  incumbentV1: { mu: (r) => r.v1, sigma: F.incumbent.sigma },
  leagueLevelBaseline: { mu: (r) => r.L, sigma: F.baselineSigma },
  v2LeagueRelative: { mu: (r) => r.v2, sigma: F.incumbent.sigma },
  v3PlayEfficiency: {
    mu: (r) => r.L + fit.v3PlayEfficiency.cS * r.S + fit.v3PlayEfficiency.cE * r.E + fit.v3PlayEfficiency.cPlays * r.Pl,
    sigma: fit.v3PlayEfficiency.sigma,
  },
  v2MarketBlend: { mu: (r) => (r.line == null ? r.v2 : r.v2 + fit.v2MarketBlend.w * (r.line - r.v2)), sigma: fit.v2MarketBlend.sigma },
  marketClose: { mu: (r) => r.line, sigma: fit.marketClose.sigma, only: (r) => r.line != null },
};

// ---- metrics -----------------------------------------------------------------------------------
const LOG_2PI = Math.log(2 * Math.PI);
function metrics(rows, name) {
  const p = PREDICTORS[name];
  const use = p.only ? rows.filter(p.only) : rows;
  const n = use.length;
  if (n < 2) return null;
  let sumMu = 0;
  let sumY = 0;
  let abs = 0;
  let sq = 0;
  let nll = 0;
  let covered = 0;
  const mus = [];
  for (const r of use) {
    const mu = p.mu(r);
    const e = r.y - mu;
    mus.push(mu);
    sumMu += mu;
    sumY += r.y;
    abs += Math.abs(e);
    sq += e * e;
    nll += 0.5 * LOG_2PI + Math.log(p.sigma) + (e * e) / (2 * p.sigma * p.sigma);
    if (Math.abs(e) <= F.z80 * p.sigma) covered += 1;
  }
  const mMu = sumMu / n;
  return {
    n,
    meanPredicted: mMu,
    meanActual: sumY / n,
    bias: mMu - sumY / n,
    mae: abs / n,
    rmse: Math.sqrt(sq / n),
    meanNll: nll / n,
    coverage80: covered / n,
    sdPredicted: Math.sqrt(mus.reduce((s, m) => s + (m - mMu) ** 2, 0) / (n - 1)),
  };
}
const round = (_k, v) => (typeof v === "number" && !Number.isInteger(v) ? Number(v.toFixed(5)) : v);
const bySeason = (rows) => [...new Set(rows.map((r) => r.season))].sort((a, b) => a - b);

// ---- --validate --------------------------------------------------------------------------------
if (MODE === "validate") {
  const completeness = {};
  for (const s of bySeason(records)) {
    const rows = records.filter((r) => r.season === s);
    completeness[s] = { games: rows.length, bothTeamsHaveEfficiency: rows.filter((r) => r.effReady).length, priced: rows.filter((r) => r.line != null).length };
  }
  console.log("input completeness (counts only):", JSON.stringify(completeness));
  console.log("dev fits:", JSON.stringify(fit, round, 1));
  for (const s of bySeason(devRows)) {
    const rows = devRows.filter((r) => r.season === s);
    console.log(`\n${s} (dev)`);
    for (const name of Object.keys(PREDICTORS)) {
      const m = metrics(rows, name);
      console.log(`  ${name.padEnd(20)} n=${m.n} mean ${m.meanPredicted.toFixed(2)} vs ${m.meanActual.toFixed(2)} bias ${m.bias.toFixed(2)} mae ${m.mae.toFixed(3)} nll ${m.meanNll.toFixed(4)} cov80 ${m.coverage80.toFixed(3)} sd ${m.sdPredicted.toFixed(2)}`);
    }
  }
  const v1r = prereg.implementationCheck;
  const m25 = metrics(devRows.filter((r) => r.season === 2025), "incumbentV1");
  console.log(`\nimplementation check vs the v1 receipt (2025): mean predicted ${m25.meanPredicted.toFixed(2)} (receipt ${v1r.meanPredicted2025}), bias ${m25.bias.toFixed(2)} (${v1r.bias2025}), MAE ${m25.mae.toFixed(3)} (${v1r.mae2025})`);
  process.exit(0);
}

// ---- --score: the one look ---------------------------------------------------------------------
const NOW = argOf("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) refuse("--now <ISO> required");
if (fs.existsSync(rel(OUT_PATH))) refuse(`${OUT_PATH} already exists — the held-out set has been looked at once`);
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
const preregCommit = git("log", "-1", "--format=%H %cI", "--", PREREG_PATH);
if (!preregCommit) refuse("the preregistration is not committed");
try { git("diff", "--quiet", "HEAD", "--", PREREG_PATH); } catch { refuse("the preregistration has uncommitted changes"); }

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Season-block bootstrap of mean(|error of A| − |error of B|); negative = A misses by less. */
function seasonBootstrap(rows, a, b) {
  const seasons = bySeason(rows);
  const agg = new Map(seasons.map((s) => [s, { sum: 0, n: 0 }]));
  for (const r of rows) {
    const o = agg.get(r.season);
    o.sum += Math.abs(r.y - PREDICTORS[a].mu(r)) - Math.abs(r.y - PREDICTORS[b].mu(r));
    o.n += 1;
  }
  const rand = mulberry32(F.bootstrap.seed);
  const stats = [];
  for (let k = 0; k < F.bootstrap.resamples; k += 1) {
    let sum = 0;
    let n = 0;
    for (let d = 0; d < seasons.length; d += 1) {
      const o = agg.get(seasons[Math.floor(rand() * seasons.length)]);
      sum += o.sum;
      n += o.n;
    }
    stats.push(sum / n);
  }
  stats.sort((x, y) => x - y);
  const point = [...agg.values()].reduce((s, o) => s + o.sum, 0) / rows.length;
  return { point, lo95: stats[Math.floor(0.025 * stats.length)], hi95: stats[Math.ceil(0.975 * stats.length) - 1] };
}

const eraRows = F.eras.map(([a, b]) => ({ era: `${a}-${b}`, rows: heldOutRows.filter((r) => inSeasons(r.season, [a, b])) }));
const results = {};
for (const name of Object.keys(PREDICTORS)) {
  results[name] = {
    overall: metrics(heldOutRows, name),
    eras: Object.fromEntries(eraRows.map((e) => [e.era, metrics(e.rows, name)])),
    seasons: Object.fromEntries(bySeason(heldOutRows).map((s) => [s, metrics(heldOutRows.filter((r) => r.season === s), name)])),
  };
}

const bar = (pass, required, observed) => ({ pass: Boolean(pass), required, observed });
const C = F.bars.centringMaxAbsBias;
const [covLo, covHi] = F.bars.coverage80Band;
const common = (name) => {
  const o = results[name].overall;
  const base = results.leagueLevelBaseline;
  return {
    centringOverall: bar(Math.abs(o.bias) <= C, `|bias| <= ${C}`, o.bias),
    centringEachEra: bar(eraRows.every((e) => Math.abs(results[name].eras[e.era].bias) <= C), `|bias| <= ${C} in every era`, Object.fromEntries(eraRows.map((e) => [e.era, results[name].eras[e.era].bias]))),
    coverage80: bar(o.coverage80 >= covLo && o.coverage80 <= covHi, `[${covLo}, ${covHi}]`, o.coverage80),
    maeBelowBaselineEachEra: bar(eraRows.every((e) => results[name].eras[e.era].mae < base.eras[e.era].mae), "MAE < league-level baseline in every era", Object.fromEntries(eraRows.map((e) => [e.era, { candidate: results[name].eras[e.era].mae, baseline: base.eras[e.era].mae }]))),
    nllBelowBaseline: bar(o.meanNll < base.overall.meanNll, `< ${base.overall.meanNll}`, o.meanNll),
  };
};

const bars = {
  v2LeagueRelative: {
    ...common("v2LeagueRelative"),
    maeNotWorseThanIncumbent: bar(results.v2LeagueRelative.overall.mae <= results.incumbentV1.overall.mae, `<= ${results.incumbentV1.overall.mae}`, results.v2LeagueRelative.overall.mae),
    noDiscriminationRegression: bar(Math.abs(results.v2LeagueRelative.overall.sdPredicted - results.incumbentV1.overall.sdPredicted) <= F.bars.sdPredictedTolerance, `within ${F.bars.sdPredictedTolerance} of ${results.incumbentV1.overall.sdPredicted}`, results.v2LeagueRelative.overall.sdPredicted),
  },
};
const comparisons = {};
for (const name of ["v3PlayEfficiency", "v2MarketBlend"]) {
  comparisons[name] = seasonBootstrap(heldOutRows, name, "v2LeagueRelative");
  bars[name] = {
    ...common(name),
    beatsV2Mae: bar(comparisons[name].hi95 < 0, "season-bootstrap 95% upper bound of mean(|err| − |err v2|) < 0", comparisons[name]),
    nllBelowV2: bar(results[name].overall.meanNll < results.v2LeagueRelative.overall.meanNll, `< ${results.v2LeagueRelative.overall.meanNll}`, results[name].overall.meanNll),
  };
}
comparisons.marketCloseVsV2 = seasonBootstrap(heldOutRows, "marketClose", "v2LeagueRelative");
comparisons.v3VsMarketClose = seasonBootstrap(heldOutRows, "v3PlayEfficiency", "marketClose");

const verdicts = Object.fromEntries(Object.entries(bars).map(([k, b]) => [k, Object.values(b).every((x) => x.pass) ? "ELIGIBLE" : "REJECTED"]));
const finalists = ["v3PlayEfficiency", "v2MarketBlend"].filter((k) => verdicts[k] === "ELIGIBLE");
const recommendation = finalists.length
  ? finalists.sort((a, b) => results[a].overall.meanNll - results[b].overall.meanNll)[0]
  : verdicts.v2LeagueRelative === "ELIGIBLE" ? "v2LeagueRelative" : "incumbentV1";

const receipt = {
  schemaVersion: 1,
  artifact: "matchup-totals-historical-replay-evaluation",
  dataClass: "PRIVATE_RESEARCH",
  program: "295",
  generatedAt: NOW,
  preregistration: { path: PREREG_PATH, commit: preregCommit },
  scriptSha256: sha256("scripts/research/nfl/replay-matchup-totals.mjs"),
  population: { heldOutSeasons: F.seasons.heldOut, heldOutGames: heldOutRows.length, heldOutGamesMissingEfficiency: heldOutRows.filter((r) => !r.effReady).length, devSeasons: F.seasons.dev, devGames: devRows.length },
  devFits: fit,
  results,
  comparisons,
  bars,
  verdicts,
  recommendation,
  recommendationRule: prereg.decisionRule,
  consequence: "Nothing publishes from this receipt. Adopting any ELIGIBLE head is its own reviewed step (coherence guards, regime stamps, artifact regeneration) and ships in a batched app/ commit the founder approves, because app/ commits trigger Vercel builds.",
};
fs.writeFileSync(rel(OUT_PATH), JSON.stringify(receipt, round, 1), { flag: "wx" });
for (const [k, v] of Object.entries(verdicts)) {
  const o = results[k].overall;
  console.log(`${k.padEnd(18)} ${v.padEnd(9)} bias ${o.bias.toFixed(2)} mae ${o.mae.toFixed(3)} nll ${o.meanNll.toFixed(4)} cov80 ${o.coverage80.toFixed(3)} sd ${o.sdPredicted.toFixed(2)}  failed: ${Object.entries(bars[k]).filter(([, b]) => !b.pass).map(([n]) => n).join(", ") || "none"}`);
}
for (const k of ["incumbentV1", "leagueLevelBaseline", "marketClose"]) {
  const o = results[k].overall;
  console.log(`${k.padEnd(18)} reference bias ${o.bias.toFixed(2)} mae ${o.mae.toFixed(3)} nll ${o.meanNll.toFixed(4)}`);
}
console.log(`recommendation: ${recommendation}`);
