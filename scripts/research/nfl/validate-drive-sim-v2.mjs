#!/usr/bin/env node
/**
 * VALIDATE NFL SIMULATION ENGINE V2 AGAINST V1 — walk-forward, no leakage (Session 13 · Phase E).
 *
 *   node scripts/research/nfl/validate-drive-sim-v2.mjs --protocol A|B [--runs 2000]
 *
 * PROTOCOLS (fixed before looking at any result):
 *   A (primary)   test 2019–2021 REG+POST · drive params fit 2015–2018 (kickoff table 2018) · anchors from the published
 *                 heads folded walk-forward — 2019–2021 lies inside BOTH heads' held-out replays (P297 2006–2021, P295
 *                 2000–2021), so neither the drive tables nor the anchors saw a test game.
 *   B (secondary) test 2023–2025 · drive params fit 2015–2022 (kickoff 2022) · anchors IN-SAMPLE for the heads' few
 *                 dev-fitted parameters (dev 2022–2025) and the 2024/2025 kickoff rules differ from the 2022 table —
 *                 labelled, never the headline.
 *
 * V1 = what the published engine does with the same anchors: win probability from the win head (analytic), margin and
 * total as independent Gaussians (σ from the heads' receipts), team score = (total ± margin) / 2.
 * V2 = nfl-drive-sim-v2 calibrated to the SAME anchors (home = (μT + μM)/2, away = (μT − μM)/2).
 * Identical anchors ⇒ the comparison isolates what the coherent game path adds or costs. Market (no-vig closing
 * moneyline, local nflverse games.csv) and the training-window home-win base rate are BENCHMARKS only.
 *
 * Measured: winner Brier / log loss (decisive games), team-score / margin / total MAE, 80% coverage, CRPS; period
 * calibration (V2 only — V1 has no period model); distribution sanity of team stats; team-level correlations vs the
 * same seasons' box scores; key-number / OT / tie frequencies; convergence 1k/5k/10k/20k; coherence failures.
 *
 * Writes data/internal/research/nfl/sim-v2/validation-<protocol>.json. Fits nothing to the test seasons.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const APP_LIB = path.join(ROOT, "app/src/lib/sports/nfl");
const { compileParams, N_PERIODS, N_TSTAT, TEAM_STAT } = await import(path.join(APP_LIB, "sim-v2/engine.mjs"));
const { calibrate, runBatch } = await import(path.join(APP_LIB, "sim-v2/simulate.mjs"));
const { winMarginGate, rowsFromTable, replayWinMarginHeads } = await import(path.join(APP_LIB, "win-margin-heads.mjs"));
const { totalsV3Gate, gamesFromTable, foldTotalsV3 } = await import(path.join(APP_LIB, "totals-play-efficiency.mjs"));

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PROTOCOL = arg("--protocol", "A");
const RUNS = Number(arg("--runs", 2000));
const P = PROTOCOL === "A"
  ? { test: [2019, 2021], fit: [2015, 2018], kickoff: 2018, anchorLeakage: "NONE — test seasons are inside both heads' held-out replays" }
  : { test: [2023, 2025], fit: [2015, 2022], kickoff: 2022, anchorLeakage: "IN-SAMPLE — heads' dev fits used 2022–2025; kickoff rules changed 2024/2025" };

const R = "data/internal/research/nfl";
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const sha = (rel) => crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, rel))).digest("hex");

// ── drive params for the protocol (fit fresh, written beside the others) ─────────────────────────────────────────
const paramsRel = `${R}/sim-v2/drive-params-${P.fit[0]}-${P.fit[1]}.json`;
execFileSync("node", [path.join(ROOT, "scripts/research/nfl/fit-drive-sim-v2.mjs"), "--first", String(P.fit[0]), "--last", String(P.fit[1]), "--kickoff-season", String(P.kickoff), "--out", path.join(ROOT, paramsRel)], { stdio: "ignore" });
const compiled = compileParams(read(paramsRel));

// ── anchors: walk-forward pregame numbers from the published heads ───────────────────────────────────────────────
const wmGate = winMarginGate(read(`${R}/reports/win-margin-historical-replay-evaluation.json`), read(`${R}/reports/win-margin-historical-replay-preregistration.json`));
const tGate = totalsV3Gate(read(`${R}/reports/matchup-totals-historical-replay-evaluation.json`), read(`${R}/reports/matchup-totals-historical-replay-preregistration.json`));
if (wmGate.win?.state !== "READY" || wmGate.margin?.state !== "READY" || tGate.state !== "READY") throw new Error("a head's gate is not READY");
const pre = new Map();
replayWinMarginHeads({ games: rowsFromTable(read(`${R}/replay/games-history-v2.json`)), gate: wmGate, onGame: (g, x) => pre.set(g.gameId, { ...x }) });
foldTotalsV3({
  games: gamesFromTable(read(`${R}/replay/games-history-v1.json`)),
  efficiencyRows: read(`${R}/replay/team-game-efficiency-v1.json`).rows,
  frozen: tGate.frozen, fit: tGate.fit,
  onDay: (day, predict) => { for (const g of day) { const o = pre.get(g.gameId); if (o) o.muT = predict(g.home, g.away); } },
});
const SIGMA_M = wmGate.margin.sigma;
const SIGMA_T = tGate.fit.sigma;

// ── actuals: box scores + OT flags + no-vig market ────────────────────────────────────────────────────────────────
const box = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, `${R}/sim-v2/team-games-v1.json.gz`))));
const byGame = new Map();
for (const t of box) { const g = byGame.get(t.g) ?? {}; g[t.home ? "home" : "away"] = t; byGame.set(t.g, g); }
const csvPath = `${R}/raw/nflverse/games.csv`;
const market = new Map();
if (fs.existsSync(path.join(ROOT, csvPath))) {
  const lines = fs.readFileSync(path.join(ROOT, csvPath), "utf8").split("\n");
  const head = lines[0].split(",");
  const ix = (k) => head.indexOf(k);
  for (const l of lines.slice(1)) {
    const c = l.split(",");
    if (!c[0]) continue;
    const ml = (v) => { const x = Number(v); return !Number.isFinite(x) || x === 0 ? null : x < 0 ? -x / (-x + 100) : 100 / (x + 100); };
    const ph = ml(c[ix("home_moneyline")]);
    const pa = ml(c[ix("away_moneyline")]);
    market.set(c[0], { ot: c[ix("overtime")] === "1", pHome: ph != null && pa != null ? ph / (ph + pa) : null, total: Number(c[ix("total_line")]) || null });
  }
}

// ── scoring helpers ───────────────────────────────────────────────────────────────────────────────────────────────
const clamp = (p) => Math.min(1 - 1e-6, Math.max(1e-6, p));
const brier = (p, y) => (p - y) ** 2;
const ll = (p, y) => -Math.log(y ? clamp(p) : 1 - clamp(p));
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
const crpsGauss = (mu, s, y) => { const z = (y - mu) / s; return s * (z * (2 * Phi(z) - 1) + 2 * Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI) - 1 / Math.sqrt(Math.PI)); };
function crpsSample(xs, y) {
  const a = Float64Array.from(xs).sort();
  const n = a.length;
  let t1 = 0;
  let t2 = 0;
  for (let i = 0; i < n; i++) { t1 += Math.abs(a[i] - y); t2 += a[i] * (2 * i - n + 1); }
  return t1 / n - t2 / (n * n);
}
const q = (xs, p) => { const a = Float64Array.from(xs).sort(); return a[Math.floor(p * (a.length - 1))]; };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
const corr = (x, y) => { const mx = mean(x); const my = mean(y); let s = 0; let sx = 0; let sy = 0; for (let i = 0; i < x.length; i++) { s += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2; } return s / Math.sqrt(sx * sy); };
const r4 = (v) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(4)));

// Base rate: home win share in the drive-fit window (training only).
const trainGames = [...byGame.entries()].filter(([, g]) => g.home && g.home.s >= P.fit[0] && g.home.s <= P.fit[1] && g.home.pts !== g.home.oppPts);
const baseHome = trainGames.filter(([, g]) => g.home.pts > g.home.oppPts).length / trainGames.length;

const games = [...byGame.entries()].filter(([id, g]) => g.home && g.away && g.home.s >= P.test[0] && g.home.s <= P.test[1] && pre.get(id)?.muT != null && pre.get(id)?.marginMean != null).sort(([a], [b]) => (a < b ? -1 : 1));
console.log(`protocol ${PROTOCOL}: ${games.length} test games · params ${paramsRel}`);

const acc = { v1: { brier: [], ll: [] }, v2: { brier: [], ll: [] }, mkt: { brier: [], ll: [] }, base: { brier: [], ll: [] }, mktN: 0 };
const cont = { v1: { teamAE: [], marginAE: [], totalAE: [], marginIn: [], totalIn: [], teamIn: [], crpsM: [], crpsT: [] }, v2: { teamAE: [], marginAE: [], totalAE: [], marginIn: [], totalIn: [], teamIn: [], crpsM: [], crpsT: [] } };
const period = { simQ: [[], [], [], []], actQ: [[], [], [], []], halfBrier: [], halfBase: [] };
const sanity = {};
const SAN = ["passAtt", "cmp", "passYds", "sacks", "rushAtt", "rushYds", "plays", "drives", "passTd", "rushTd", "int", "fumLost", "fgMade"];
for (const k of SAN) sanity[k] = { sim: [], act: [] };
const corrSim = { passAttMargin: [[], []], rushAttMargin: [[], []], ownOppPts: [[], []], passTdPts: [[], []], playsTotal: [[], []] };
const corrAct = { passAttMargin: [[], []], rushAttMargin: [[], []], ownOppPts: [[], []], passTdPts: [[], []], playsTotal: [[], []] };
const keySim = new Map();
let keySimN = 0;
const keyAct = new Map();
let otSim = 0;
let otAct = 0;
let otActN = 0;
let tieSim = 0;
let tieAct = 0;
let failedRuns = 0;
let totalRuns = 0;
const failureCodes = {};

let gi = 0;
for (const [id, g] of games) {
  const a = pre.get(id);
  const muH = (a.muT + a.marginMean) / 2;
  const muA = (a.muT - a.marginMean) / 2;
  const seed = crypto.createHash("sha256").update(`validate|${PROTOCOL}|${id}`).digest("hex").slice(0, 8);
  const postseason = g.home.st === "POST";
  const cal = calibrate({ compiled, anchors: { home: muH, away: muA }, baseSeed: seed, runs: 800, postseason });
  const b = runBatch({ compiled, thetas: cal.thetas, baseSeed: seed, runs: RUNS, postseason });
  failedRuns += b.failedRuns;
  totalRuns += b.runs;
  for (const [c, n] of Object.entries(b.failureCodes)) failureCodes[c] = (failureCodes[c] ?? 0) + n;
  const hs = [];
  const as = [];
  let hw = 0;
  let aw = 0;
  for (let i = 0; i < b.runs; i++) {
    const h = b.scores[2 * i];
    const w = b.scores[2 * i + 1];
    hs.push(h); as.push(w);
    if (h > w) hw++; else if (w > h) aw++; else tieSim++;
    otSim += b.ot[i];
    const m = Math.abs(h - w);
    keySim.set(m, (keySim.get(m) ?? 0) + 1);
    keySimN++;
    for (let p = 0; p < 4; p++) period.simQ[p].push(b.periods[(i * 2) * N_PERIODS + p] + b.periods[(i * 2 + 1) * N_PERIODS + p]);
  }
  const margins = hs.map((h, i) => h - as[i]);
  const totals = hs.map((h, i) => h + as[i]);
  const actH = g.home.pts;
  const actA = g.away.pts;
  const actM = actH - actA;
  const actT = actH + actA;

  // winner (decisive games)
  if (actM !== 0) {
    const y = actM > 0 ? 1 : 0;
    const pV1 = a.pHome;
    const pV2 = hw / b.runs;
    acc.v1.brier.push(brier(pV1, y)); acc.v1.ll.push(ll(pV1, y));
    acc.v2.brier.push(brier(pV2, y)); acc.v2.ll.push(ll(pV2, y));
    acc.base.brier.push(brier(baseHome, y)); acc.base.ll.push(ll(baseHome, y));
    const mk = market.get(id);
    if (mk?.pHome != null) { acc.mkt.brier.push(brier(mk.pHome, y)); acc.mkt.ll.push(ll(mk.pHome, y)); acc.mktN++; }
  } else tieAct++;
  // continuous
  const z = 1.2815516;
  for (const [side, mu, act] of [[0, muH, actH], [1, muA, actA]]) {
    cont.v1.teamAE.push(Math.abs(mu - act));
    const arr = side === 0 ? hs : as;
    cont.v2.teamAE.push(Math.abs(q(arr, 0.5) - act));
    const sTeam = Math.sqrt(SIGMA_T ** 2 + SIGMA_M ** 2) / 2;
    cont.v1.teamIn.push(act >= mu - z * sTeam && act <= mu + z * sTeam);
    cont.v2.teamIn.push(act >= q(arr, 0.1) && act <= q(arr, 0.9));
  }
  cont.v1.marginAE.push(Math.abs(a.marginMean - actM)); cont.v2.marginAE.push(Math.abs(q(margins, 0.5) - actM));
  cont.v1.totalAE.push(Math.abs(a.muT - actT)); cont.v2.totalAE.push(Math.abs(q(totals, 0.5) - actT));
  cont.v1.marginIn.push(Math.abs(actM - a.marginMean) <= z * SIGMA_M); cont.v2.marginIn.push(actM >= q(margins, 0.1) && actM <= q(margins, 0.9));
  cont.v1.totalIn.push(Math.abs(actT - a.muT) <= z * SIGMA_T); cont.v2.totalIn.push(actT >= q(totals, 0.1) && actT <= q(totals, 0.9));
  cont.v1.crpsM.push(crpsGauss(a.marginMean, SIGMA_M, actM)); cont.v2.crpsM.push(crpsSample(margins, actM));
  cont.v1.crpsT.push(crpsGauss(a.muT, SIGMA_T, actT)); cont.v2.crpsT.push(crpsSample(totals, actT));
  // periods
  const pp = (t, p) => t.periodPts?.[String(p + 1)] ?? 0;
  for (let p = 0; p < 4; p++) period.actQ[p].push(pp(g.home, p) + pp(g.away, p));
  const actHalf = pp(g.home, 0) + pp(g.home, 1) - pp(g.away, 0) - pp(g.away, 1);
  if (actHalf !== 0) {
    let lead = 0;
    for (let i = 0; i < b.runs; i++) {
      const d = b.periods[(i * 2) * N_PERIODS] + b.periods[(i * 2) * N_PERIODS + 1] - b.periods[(i * 2 + 1) * N_PERIODS] - b.periods[(i * 2 + 1) * N_PERIODS + 1];
      if (d > 0) lead++;
    }
    const decided = b.runs; // ties at half count against "home leads"
    period.halfBrier.push(brier(lead / decided, actHalf > 0 ? 1 : 0));
    period.halfBase.push(brier(0.5, actHalf > 0 ? 1 : 0));
  }
  // team stat sanity + correlations (one run per game for the simulated side of each correlation)
  for (const s of [0, 1]) {
    const t = s === 0 ? g.home : g.away;
    for (const k of SAN) {
      sanity[k].act.push(k === "rushAtt" ? t.rushAtt + t.scrambles : t[k]);
      sanity[k].sim.push(b.team[(0 * 2 + s) * N_TSTAT + TEAM_STAT[k]]);
    }
    const r0 = (k) => b.team[(0 * 2 + s) * N_TSTAT + TEAM_STAT[k]];
    const own = b.scores[s];
    const opp = b.scores[1 - s];
    corrSim.passAttMargin[0].push(r0("passAtt")); corrSim.passAttMargin[1].push(own - opp);
    corrSim.rushAttMargin[0].push(r0("rushAtt")); corrSim.rushAttMargin[1].push(own - opp);
    corrSim.ownOppPts[0].push(own); corrSim.ownOppPts[1].push(opp);
    corrSim.passTdPts[0].push(r0("passTd")); corrSim.passTdPts[1].push(own);
    corrSim.playsTotal[0].push(r0("plays")); corrSim.playsTotal[1].push(own + opp);
    corrAct.passAttMargin[0].push(t.passAtt); corrAct.passAttMargin[1].push(t.pts - t.oppPts);
    corrAct.rushAttMargin[0].push(t.rushAtt + t.scrambles); corrAct.rushAttMargin[1].push(t.pts - t.oppPts);
    corrAct.ownOppPts[0].push(t.pts); corrAct.ownOppPts[1].push(t.oppPts);
    corrAct.passTdPts[0].push(t.passTd); corrAct.passTdPts[1].push(t.pts);
    corrAct.playsTotal[0].push(t.plays); corrAct.playsTotal[1].push(t.pts + t.oppPts);
  }
  keyAct.set(Math.abs(actM), (keyAct.get(Math.abs(actM)) ?? 0) + 1);
  const mk = market.get(id);
  if (mk) { otActN++; if (mk.ot) otAct++; }
  if (++gi % 100 === 0) console.log(`  ${gi}/${games.length}`);
}

// ── convergence on five fixed test games ──────────────────────────────────────────────────────────────────────────
const convergence = [];
for (const [id, g] of games.filter((_, i) => i % Math.max(1, Math.floor(games.length / 5)) === 0).slice(0, 5)) {
  const a = pre.get(id);
  const seed = crypto.createHash("sha256").update(`convergence|${id}`).digest("hex").slice(0, 8);
  const cal = calibrate({ compiled, anchors: { home: (a.muT + a.marginMean) / 2, away: (a.muT - a.marginMean) / 2 }, baseSeed: seed, runs: 1500 });
  const row = { gameId: id, at: {} };
  for (const n of [1000, 5000, 10000, 20000]) {
    const b = runBatch({ compiled, thetas: cal.thetas, baseSeed: seed, runs: n, check: false });
    let hw = 0; let ot = 0; const tot = []; const mar = [];
    for (let i = 0; i < n; i++) { const h = b.scores[2 * i]; const w = b.scores[2 * i + 1]; if (h > w) hw++; ot += b.ot[i]; tot.push(h + w); mar.push(h - w); }
    row.at[n] = { pHome: r4(hw / n), overtime: r4(ot / n), totalP50: q(tot, 0.5), marginP10: q(mar, 0.1), marginP90: q(mar, 0.9) };
  }
  const ref = row.at[20000];
  row.maxAbsDiffVs20k = Object.fromEntries([1000, 5000, 10000].map((n) => [n, { pHome: r4(Math.abs(row.at[n].pHome - ref.pHome)), overtime: r4(Math.abs(row.at[n].overtime - ref.overtime)) }]));
  convergence.push(row);
}

const kf = (map, n, k) => r4((map.get(k) ?? 0) / n);
const actualN = games.length;
const summary = {
  winner: {
    n: acc.v1.brier.length,
    v1: { brier: r4(mean(acc.v1.brier)), logLoss: r4(mean(acc.v1.ll)) },
    v2: { brier: r4(mean(acc.v2.brier)), logLoss: r4(mean(acc.v2.ll)) },
    baseRate: { p: r4(baseHome), brier: r4(mean(acc.base.brier)), logLoss: r4(mean(acc.base.ll)) },
    market: acc.mktN ? { n: acc.mktN, brier: r4(mean(acc.mkt.brier)), logLoss: r4(mean(acc.mkt.ll)), note: "no-vig closing moneyline, benchmark only" } : null,
  },
  continuous: Object.fromEntries(["v1", "v2"].map((v) => [v, {
    teamScoreMAE: r4(mean(cont[v].teamAE)), marginMAE: r4(mean(cont[v].marginAE)), totalMAE: r4(mean(cont[v].totalAE)),
    teamScoreCov80: r4(mean(cont[v].teamIn.map(Number))), marginCov80: r4(mean(cont[v].marginIn.map(Number))), totalCov80: r4(mean(cont[v].totalIn.map(Number))),
    marginCRPS: r4(mean(cont[v].crpsM)), totalCRPS: r4(mean(cont[v].crpsT)),
  }])),
  periods: {
    quarterMeanPoints: { sim: period.simQ.map((x) => r4(mean(x))), actual: period.actQ.map((x) => r4(mean(x))) },
    homeLeadsAtHalf: { n: period.halfBrier.length, v2Brier: r4(mean(period.halfBrier)), coinBrier: r4(mean(period.halfBase)), v1: "NO PERIOD MODEL" },
  },
  distributionSanity: Object.fromEntries(SAN.map((k) => [k, { simMean: r4(mean(sanity[k].sim)), actMean: r4(mean(sanity[k].act)), simSd: r4(sd(sanity[k].sim)), actSd: r4(sd(sanity[k].act)) }])),
  correlations: Object.fromEntries(Object.keys(corrSim).map((k) => [k, { sim: r4(corr(...corrSim[k])), actual: r4(corr(...corrAct[k])) }])),
  frequencies: {
    overtime: { sim: r4(otSim / totalRuns), actual: otActN ? r4(otAct / otActN) : null },
    tie: { sim: r4(tieSim / totalRuns), actual: r4(tieAct / actualN) },
    absMargin: Object.fromEntries([1, 2, 3, 4, 6, 7, 10, 14].map((k) => [k, { sim: kf(keySim, keySimN, k), actual: kf(keyAct, actualN, k) }])),
  },
  coherence: { runs: totalRuns, failedRuns, failureCodes },
  convergence,
};
const out = {
  schemaVersion: "nfl-sim-v2-validation@1",
  engine: "nfl-drive-sim-v2",
  protocol: PROTOCOL,
  testSeasons: P.test,
  driveFitSeasons: P.fit,
  kickoffSeason: P.kickoff,
  anchorLeakage: P.anchorLeakage,
  runsPerGame: RUNS,
  games: games.length,
  params: { file: paramsRel, sha256: sha(paramsRel) },
  anchorHeads: { win: "nfl-win-elo-mov-v1", margin: "nfl-margin-elo-hfa-v1", totals: "matchup-totals-v3-play-efficiency", sigmaMargin: SIGMA_M, sigmaTotal: SIGMA_T },
  marketSource: market.size ? `${csvPath} (local, git-ignored) sha256 ${sha(csvPath)}` : "unavailable",
  summary,
};
fs.writeFileSync(path.join(ROOT, `${R}/sim-v2/validation-${PROTOCOL}.json`), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 1));
