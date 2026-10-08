#!/usr/bin/env node
/**
 * NFL-002 TEAM LADDER — HISTORICAL WALK-FORWARD REPLAY.
 * Executes data/internal/research/nfl/reports/nfl-002-team-ladder-preregistration.json.
 *   --validate            DEV seasons only (2022-2025): grid traces, dev fits, implementation checks.
 *                         Writes nfl-002-team-ladder-dev.json. No held-out metric is computed.
 *   --score --now <ISO>   the ONE look at held-out 2006-2021 (+ the forward guard 2016-2021 and the
 *                         report-only 2026 Weeks 1-4). Refuses unless the registration is committed and
 *                         unmodified, and refuses if the evaluation file already exists.
 * Lives outside app/ on purpose: research runs never trigger an app build.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  foldTeamLadder, fitStack, fitEdgeHead, predictStack, predictEdgeHead, crpsNormal, phi,
  L2_ID, L3_ID, L6_ID, LADDER_PREREG,
} from "../../../app/src/lib/sports/nfl/team-ladder-v2.mjs";
import { winMarginGate, rowsFromTable, replayWinMarginHeads, WIN_MARGIN_RECEIPT, WIN_MARGIN_PREREG, GAMES_HISTORY_V2 } from "../../../app/src/lib/sports/nfl/win-margin-heads.mjs";
import { totalsV3Gate, foldTotalsV3, TOTALS_REPLAY_RECEIPT, TOTALS_REPLAY_PREREG, EFFICIENCY_HISTORY, CURRENT_SEASON } from "../../../app/src/lib/sports/nfl/totals-play-efficiency.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const read = (p) => JSON.parse(fs.readFileSync(rel(p), "utf8"));
const DEV_OUT = "data/internal/research/nfl/reports/nfl-002-team-ladder-dev.json";
const EVAL_OUT = "data/internal/research/nfl/reports/nfl-002-team-ladder-evaluation.json";
const GAMES_CSV = "data/internal/research/nfl/raw/nflverse/games.csv";

const argv = process.argv.slice(2);
const MODE = argv.includes("--score") ? "score" : argv.includes("--validate") ? "validate" : null;
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const refuse = (why) => { console.error(`REFUSED: ${why}`); process.exit(1); };
if (!MODE) refuse("usage: --validate | --score --now <ISO>");

const prereg = read(LADDER_PREREG);
const F = prereg.frozen;
const csvBytes = fs.readFileSync(rel(GAMES_CSV));
if (crypto.createHash("sha256").update(csvBytes).digest("hex") !== F.inputs.gamesCsvSha256) refuse("games.csv does not match the registered hash");

if (MODE === "score") {
  const now = argOf("--now");
  if (!now || !Number.isFinite(Date.parse(now))) refuse("--score needs --now <ISO>");
  if (fs.existsSync(rel(EVAL_OUT))) refuse(`${EVAL_OUT} exists — the held-out look has been taken`);
  try {
    const committed = execFileSync("git", ["show", `HEAD:${LADDER_PREREG}`], { cwd: ROOT }).toString();
    if (committed !== fs.readFileSync(rel(LADDER_PREREG), "utf8")) refuse("the registration differs from its committed version");
  } catch { refuse("the registration is not committed"); }
}

// ── inputs ──────────────────────────────────────────────────────────────────────────────────────────
function parseCsvLine(line) {
  const out = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i += 1; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out;
}
const lines = csvBytes.toString("utf8").replace(/\r/g, "").trim().split("\n");
const header = parseCsvLine(lines[0]);
const col = Object.fromEntries(header.map((h, i) => [h, i]));
const num = (s) => (s === "" || s === "NA" ? null : Number(s));
const csvBy = new Map();
for (const line of lines.slice(1)) {
  const r = parseCsvLine(line);
  csvBy.set(r[col.game_id], { homeRest: num(r[col.home_rest]), awayRest: num(r[col.away_rest]), mlHome: num(r[col.home_moneyline]), mlAway: num(r[col.away_moneyline]) });
}
const rest = new Map([...csvBy].map(([k, v]) => [k, { homeRest: v.homeRest, awayRest: v.awayRest }]));

const history = read(GAMES_HISTORY_V2);
const histRows = rowsFromTable(history);
const effRows = read(EFFICIENCY_HISTORY).rows;
const current = read(CURRENT_SEASON);
const currentRows = rowsFromTable(current).filter((g) => g.season > history.seasons[1]);
const currentEff = (current.efficiencyRows ?? []).filter((r) => r.season > history.seasons[1]);
const allGames = [...histRows, ...currentRows];
const allEff = [...effRows, ...currentEff];
const inS = (s, [a, b]) => s >= a && s <= b;

// ── one fold → per-game features (pregame) ──────────────────────────────────────────────────────────
const ELO_FIX = (() => {
  const r = read(WIN_MARGIN_RECEIPT);
  return { eloK: r.devFits.eloMov.K, eloHome: r.devFits.eloMov.homeAdvantage };
})();
function featuresRun(params) {
  const out = new Map();
  foldTeamLadder({
    games: allGames, efficiencyRows: allEff, frozen: { franchiseMap: prereg.replayMechanics.franchiseMap },
    params: { ...ELO_FIX, ...params }, rest, restCap: F.restCap,
    onDay: (day, featuresFor) => { for (const g of day) out.set(g.gameId, featuresFor(g)); },
  });
  return out;
}
const obsFor = (feat, window) => allGames
  .filter((g) => inS(g.season, window) && Number.isInteger(g.homeScore))
  .map((g) => ({ g, features: feat.get(g.gameId), margin: g.homeScore - g.awayScore, total: g.homeScore + g.awayScore }));

// ── metrics ─────────────────────────────────────────────────────────────────────────────────────────
const clamp = (p) => Math.min(1 - F.probabilityClamp, Math.max(F.probabilityClamp, p));
const ll = (p, y) => -(y ? Math.log(clamp(p)) : Math.log(1 - clamp(p)));
function ece(ps, ys) {
  const bins = Array.from({ length: F.eceBins }, () => ({ n: 0, p: 0, y: 0 }));
  ps.forEach((p, i) => { const b = bins[Math.min(F.eceBins - 1, Math.floor(p * F.eceBins))]; b.n += 1; b.p += p; b.y += ys[i]; });
  return bins.reduce((s, b) => s + (b.n ? (b.n / ps.length) * Math.abs(b.p / b.n - b.y / b.n) : 0), 0);
}
const nllNormal = (mu, s, x) => 0.5 * Math.log(2 * Math.PI * s * s) + ((x - mu) ** 2) / (2 * s * s);
const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(5)));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function winMetrics(rows, key) {
  const dec = rows.filter((r) => r.margin !== 0 && r[key] != null);
  const ps = dec.map((r) => r[key]);
  const ys = dec.map((r) => (r.margin > 0 ? 1 : 0));
  return { decisive: dec.length, logLoss: r5(mean(ps.map((p, i) => ll(p, ys[i])))), brier: r5(mean(ps.map((p, i) => (p - ys[i]) ** 2))), ece: r5(ece(ps, ys)) };
}
function distMetrics(rows, muKey, sKey, target) {
  const ok = rows.filter((r) => r[muKey] != null);
  const z = F.z80;
  return {
    n: ok.length,
    mae: r5(mean(ok.map((r) => Math.abs(r[target] - r[muKey])))),
    rmse: r5(Math.sqrt(mean(ok.map((r) => (r[target] - r[muKey]) ** 2)))),
    bias: r5(mean(ok.map((r) => r[muKey] - r[target]))),
    crps: r5(mean(ok.map((r) => crpsNormal(r[muKey], r[sKey], r[target])))),
    nll: r5(mean(ok.map((r) => nllNormal(r[muKey], r[sKey], r[target])))),
    coverage80: r5(mean(ok.map((r) => (Math.abs(r[target] - r[muKey]) <= z * r[sKey] ? 1 : 0)))),
  };
}
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** Season-unit bootstrap of a paired per-game difference (candidate − comparator). */
function seasonBootstrap(rows, diffOf) {
  const bySeason = new Map();
  for (const r of rows) { const d = diffOf(r); if (d == null || !Number.isFinite(d)) continue; if (!bySeason.has(r.season)) bySeason.set(r.season, []); bySeason.get(r.season).push(d); }
  const seasons = [...bySeason.keys()].sort();
  const all = seasons.flatMap((s) => bySeason.get(s));
  const rnd = mulberry32(F.bootstrap.seed);
  const stats = [];
  for (let b = 0; b < F.bootstrap.resamples; b += 1) {
    let s = 0; let n = 0;
    for (let k = 0; k < seasons.length; k += 1) { const xs = bySeason.get(seasons[Math.floor(rnd() * seasons.length)]); for (const x of xs) s += x; n += xs.length; }
    stats.push(s / n);
  }
  stats.sort((a, b) => a - b);
  return { point: r5(mean(all)), lo95: r5(stats[Math.floor(0.025 * stats.length)]), hi95: r5(stats[Math.floor(0.975 * stats.length) - 1]), n: all.length };
}

// ── incumbent + v3 + market per game ────────────────────────────────────────────────────────────────
const wmGate = winMarginGate(read(WIN_MARGIN_RECEIPT), read(WIN_MARGIN_PREREG));
if (wmGate.win.state !== "READY" || wmGate.margin.state !== "READY") refuse("incumbent win/margin gate not READY");
const incumbent = new Map();
replayWinMarginHeads({ games: histRows, gate: wmGate, onGame: (g, x) => incumbent.set(g.gameId, x) });
const tGate = totalsV3Gate(read(TOTALS_REPLAY_RECEIPT), read(TOTALS_REPLAY_PREREG));
if (tGate.state !== "READY") refuse("v3 totals gate not READY");
const v3 = new Map();
foldTotalsV3({ games: histRows, efficiencyRows: effRows, frozen: tGate.frozen, fit: tGate.fit, onDay: (day, predict) => { for (const g of day) v3.set(g.gameId, predict(g.home, g.away)); } });
const implied = (ml) => (ml == null ? null : ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100));
const marketP = (gid) => { const c = csvBy.get(gid); const h = implied(c?.mlHome); const a = implied(c?.mlAway); return h != null && a != null ? h / (h + a) : null; };

// ── grid selection + fits on a window ───────────────────────────────────────────────────────────────
const GE = prereg.candidates.L2_epa_adj.grid;
const GP = prereg.candidates.L3_dyn_od_points.grid;
function winLL(obs, pred) { const d = obs.filter((o) => o.margin !== 0); return mean(d.map((o) => ll(pred(o).pHome, o.margin > 0 ? 1 : 0))); }
function selectAndFit(window) {
  const traces = { L2: [], L3: [] };
  let bestE = null; let bestP = null;
  for (const gE of GE.g_e) for (const carryE of GE.carry_e) {
    const feat = featuresRun({ gE, carryE, gP: 0.05, carryP: 0.67 });
    const obs = obsFor(feat, window);
    const head = fitEdgeHead(obs, "epaEdge");
    const score = winLL(obs, (o) => predictEdgeHead(head, o.features));
    traces.L2.push({ gE, carryE, devWinLogLoss: r5(score) });
    if (!bestE || score < bestE.score) bestE = { gE, carryE, score };
  }
  for (const gP of GP.g_p) for (const carryP of GP.carry_p) {
    const feat = featuresRun({ gE: 0.05, carryE: 0.67, gP, carryP });
    const obs = obsFor(feat, window);
    const head = fitEdgeHead(obs, "ptsEdge");
    const score = winLL(obs, (o) => predictEdgeHead(head, o.features));
    traces.L3.push({ gP, carryP, devWinLogLoss: r5(score) });
    if (!bestP || score < bestP.score) bestP = { gP, carryP, score };
  }
  const params = { gE: bestE.gE, carryE: bestE.carryE, gP: bestP.gP, carryP: bestP.carryP };
  const feat = featuresRun(params);
  const obs = obsFor(feat, window);
  const l2 = fitEdgeHead(obs, "epaEdge");
  const l3 = fitEdgeHead(obs, "ptsEdge");
  const stack = fitStack(obs);
  return { window, params, traces, l2, l3, stack, feat, devObs: obs.length };
}

function scoreRows(sel, window) {
  return allGames.filter((g) => inS(g.season, window) && Number.isInteger(g.homeScore)).map((g) => {
    const f = sel.feat.get(g.gameId);
    const s = predictStack(sel.stack, f);
    const e = predictEdgeHead(sel.l2, f);
    const p = predictEdgeHead(sel.l3, f);
    const inc = incumbent.get(g.gameId) ?? {};
    return {
      gameId: g.gameId, season: g.season, margin: g.homeScore - g.awayScore, total: g.homeScore + g.awayScore,
      pL6: s.pHome, muL6: s.muM, sL6: s.sigmaM, muTL6: s.muT, sTL6: s.sigmaT,
      pL2: e.pHome, muL2: e.muM, sL2: e.sigmaM, pL3: p.pHome, muL3: p.muM, sL3: p.sigmaM,
      pInc: inc.pHome ?? null, muInc: inc.marginMean ?? null, sInc: wmGate.margin.sigma,
      pIncMarginImplied: inc.marginMean != null ? phi(inc.marginMean / wmGate.margin.sigma) : null,
      muV3: v3.get(g.gameId) ?? null, sV3: tGate.fit.sigma,
      pMkt: marketP(g.gameId),
    };
  });
}

function summarize(rows) {
  const priced = rows.filter((r) => r.pMkt != null);
  const v3rows = rows.filter((r) => r.muV3 != null);
  return {
    games: rows.length,
    win: {
      L6: winMetrics(rows, "pL6"), L2: winMetrics(rows, "pL2"), L3: winMetrics(rows, "pL3"),
      incumbent: winMetrics(rows, "pInc"), incumbentMarginImplied: winMetrics(rows, "pIncMarginImplied"),
      L6OnPriced: winMetrics(priced, "pL6"), marketOnPriced: winMetrics(priced, "pMkt"),
    },
    margin: { L6: distMetrics(rows, "muL6", "sL6", "margin"), L2: distMetrics(rows, "muL2", "sL2", "margin"), L3: distMetrics(rows, "muL3", "sL3", "margin"), incumbent: distMetrics(rows, "muInc", "sInc", "margin") },
    totals: { comparedGames: v3rows.length, L6: distMetrics(v3rows, "muTL6", "sTL6", "total"), v3: distMetrics(v3rows, "muV3", "sV3", "total") },
  };
}

// ── run ─────────────────────────────────────────────────────────────────────────────────────────────
const dev = selectAndFit(F.seasons.dev);
const devRows = scoreRows(dev, F.seasons.dev);
const sideDisagreeDev = devRows.filter((r) => r.pInc != null && r.muInc != null && r.muInc !== 0 && (r.pInc > 0.5) !== (r.muInc > 0)).length;
const devReport = {
  schemaVersion: 1,
  artifact: "nfl-002-team-ladder-dev",
  dataClass: "PRIVATE_RESEARCH",
  preregistration: LADDER_PREREG,
  generatedBy: "scripts/research/nfl/replay-team-ladder.mjs --validate",
  scriptSha256: crypto.createHash("sha256").update(fs.readFileSync(fileURLToPath(import.meta.url))).digest("hex"),
  devSeasons: F.seasons.dev,
  selected: dev.params,
  eloFixed: ELO_FIX,
  fits: { [L2_ID]: dev.l2, [L3_ID]: dev.l3, [L6_ID]: dev.stack },
  gridTraces: dev.traces,
  devMetricsInSample: summarize(devRows),
  incumbentSideDisagreementsOnDev: sideDisagreeDev,
};

// Implementation checks — the incumbent and v3 must reproduce their receipts on THEIR held-out windows.
// These read held-out incumbent numbers only (already published in their receipts), never a candidate.
const wmReceipt = read(WIN_MARGIN_RECEIPT);
const incHeld = histRows.filter((g) => inS(g.season, F.seasons.heldOut)).map((g) => ({ margin: g.homeScore - g.awayScore, pInc: incumbent.get(g.gameId)?.pHome, muInc: incumbent.get(g.gameId)?.marginMean, sInc: wmGate.margin.sigma }));
const incWin = winMetrics(incHeld, "pInc");
const incMargin = distMetrics(incHeld, "muInc", "sInc", "margin");
const tReceipt = read(TOTALS_REPLAY_RECEIPT);
const v3Held = histRows.filter((g) => inS(g.season, tReceipt.population.heldOutSeasons) && v3.has(g.gameId)).map((g) => ({ total: g.homeScore + g.awayScore, muV3: v3.get(g.gameId), sV3: tGate.fit.sigma }));
const v3Check = distMetrics(v3Held, "muV3", "sV3", "total");
const checks = {
  incumbentWinLogLoss: { expected: wmReceipt.results.eloMov.win.overall.logLoss, observed: incWin.logLoss },
  incumbentMarginMae: { expected: wmReceipt.results.eloHfaRefit.margin.overall.mae, observed: incMargin.mae },
  v3TotalsMae: { expected: tReceipt.results.v3PlayEfficiency?.overall?.mae ?? null, observed: v3Check.mae },
};
for (const [k, c] of Object.entries(checks)) {
  c.pass = c.expected != null && Math.abs(c.expected - c.observed) <= 1e-4;
  if (!c.pass) console.error(`IMPLEMENTATION CHECK ${k}: expected ${c.expected}, observed ${c.observed}`);
}
devReport.implementationChecks = checks;
fs.writeFileSync(rel(DEV_OUT), `${JSON.stringify(devReport, null, 2)}\n`);
console.log(`dev written: ${DEV_OUT}`);
console.log(JSON.stringify({ selected: dev.params, stack: dev.stack.margin, totals: dev.stack.total, rho: dev.stack.rho, checks }, null, 1));
console.log(JSON.stringify(devReport.devMetricsInSample, null, 1));
if (Object.values(checks).some((c) => !c.pass)) refuse("implementation checks failed — nothing is scored");
if (MODE === "validate") process.exit(0);

// ── the ONE held-out look ───────────────────────────────────────────────────────────────────────────
const heldRows = scoreRows(dev, F.seasons.heldOut);
const held = summarize(heldRows);
const eras = Object.fromEntries(F.eras ?? prereg.heldOutSet.eras.map(([a, b]) => [`${a}-${b}`, summarize(heldRows.filter((r) => inS(r.season, [a, b])))]));
const decisive = heldRows.filter((r) => r.margin !== 0);
const winDiff = seasonBootstrap(decisive, (r) => ll(r.pL6, r.margin > 0 ? 1 : 0) - ll(r.pInc, r.margin > 0 ? 1 : 0));
const marginDiff = seasonBootstrap(heldRows, (r) => Math.abs(r.margin - r.muL6) - Math.abs(r.margin - r.muInc));
const v3Rows = heldRows.filter((r) => r.muV3 != null);
const totalNllDiff = seasonBootstrap(v3Rows, (r) => nllNormal(r.muTL6, r.sTL6, r.total) - nllNormal(r.muV3, r.sV3, r.total));

// Forward guard: everything re-selected and re-fit on 2006-2015, scored on 2016-2021.
const fg = selectAndFit(F.seasons.forwardGuard.fit);
const fgRows = scoreRows(fg, F.seasons.forwardGuard.score);
const fgSum = summarize(fgRows);

// 2026 Weeks 1-4, report only (dev-fitted L6).
const rows2026 = scoreRows(dev, [2026, 2026]);
const sum2026 = rows2026.length ? summarize(rows2026) : null;

const eraKeys = Object.keys(eras);
const W = held.win; const M = held.margin; const T = held.totals;
const winBars = {
  logLossImprovement: { pass: W.L6.logLoss <= W.incumbent.logLoss - 0.003, observed: W.L6.logLoss, incumbent: W.incumbent.logLoss },
  notNoise: { pass: winDiff.hi95 < 0, observed: winDiff },
  eras: { pass: eraKeys.filter((k) => eras[k].win.L6.logLoss < eras[k].win.incumbent.logLoss).length >= 2 && eraKeys.every((k) => eras[k].win.L6.logLoss - eras[k].win.incumbent.logLoss <= 0.005), observed: Object.fromEntries(eraKeys.map((k) => [k, { L6: eras[k].win.L6.logLoss, incumbent: eras[k].win.incumbent.logLoss }])) },
  calibration: { pass: W.L6.ece <= W.incumbent.ece + 0.01, observed: W.L6.ece, incumbent: W.incumbent.ece },
  marketHardStop: { pass: W.L6OnPriced.logLoss < W.marketOnPriced.logLoss + 0.02, observed: W.L6OnPriced.logLoss, market: W.marketOnPriced.logLoss },
  forwardGuard: { pass: fgSum.win.L6.logLoss <= fgSum.win.incumbent.logLoss, observed: fgSum.win.L6.logLoss, incumbent: fgSum.win.incumbent.logLoss },
};
const band = (c) => c >= 0.75 && c <= 0.85;
const coverageEvery = band(M.L6.coverage80) && eraKeys.every((k) => band(eras[k].margin.L6.coverage80));
const marginBars = {
  maeImprovement: { pass: M.L6.mae < M.incumbent.mae && marginDiff.hi95 < 0, observed: M.L6.mae, incumbent: M.incumbent.mae, bootstrap: marginDiff },
  nonInferior: { pass: M.L6.mae <= M.incumbent.mae + 0.05, observed: M.L6.mae },
  coverageBand: { pass: coverageEvery, observed: { overall: M.L6.coverage80, ...Object.fromEntries(eraKeys.map((k) => [k, eras[k].margin.L6.coverage80])) } },
  forwardGuard: { pass: fgSum.margin.L6.mae <= fgSum.margin.incumbent.mae + 0.05, observed: fgSum.margin.L6.mae, incumbent: fgSum.margin.incumbent.mae },
};
const totalsBars = {
  mae: { pass: T.L6.mae < T.v3.mae, observed: T.L6.mae, v3: T.v3.mae },
  nll: { pass: T.L6.nll < T.v3.nll && totalNllDiff.hi95 < 0, observed: T.L6.nll, v3: T.v3.nll, bootstrap: totalNllDiff },
  coverageBand: { pass: band(T.L6.coverage80) && eraKeys.every((k) => band(eras[k].totals.L6.coverage80)), observed: { overall: T.L6.coverage80, ...Object.fromEntries(eraKeys.map((k) => [k, eras[k].totals.L6.coverage80])) } },
  bias: { pass: eraKeys.every((k) => Math.abs(eras[k].totals.L6.bias) <= 1.0), observed: Object.fromEntries(eraKeys.map((k) => [k, eras[k].totals.L6.bias])) },
  forwardGuard: { pass: fgSum.totals.L6.mae <= fgSum.totals.v3.mae, observed: fgSum.totals.L6.mae, v3: fgSum.totals.v3.mae },
};
const all = (o) => Object.values(o).every((b) => b.pass);
const winV = all(winBars) ? "ELIGIBLE" : "REJECTED";
const marginV = marginBars.maeImprovement.pass && marginBars.coverageBand.pass && marginBars.forwardGuard.pass ? "ELIGIBLE"
  : marginBars.nonInferior.pass && marginBars.coverageBand.pass && marginBars.forwardGuard.pass ? "NONINFERIOR" : "REJECTED";
const pairV = winV === "ELIGIBLE" && marginV !== "REJECTED" ? "ELIGIBLE" : "REJECTED";
const totalsV = all(totalsBars) ? "ELIGIBLE" : "REJECTED";

const evaluation = {
  schemaVersion: 1,
  artifact: "nfl-002-team-ladder-evaluation",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: argOf("--now"),
  preregistration: LADDER_PREREG,
  scriptSha256: devReport.scriptSha256,
  population: { heldOutSeasons: F.seasons.heldOut, heldOutGames: heldRows.length, heldOutDecisive: decisive.length, totalsComparedGames: v3Rows.length },
  devFits: devReport.fits,
  selected: dev.params,
  results: { overall: held, eras, perSeason: Object.fromEntries([...new Set(heldRows.map((r) => r.season))].sort().map((s) => [s, summarize(heldRows.filter((r) => r.season === s)).win])) },
  forwardGuard: { fit: F.seasons.forwardGuard.fit, score: F.seasons.forwardGuard.score, selected: fg.params, results: fgSum },
  season2026ReportOnly: sum2026,
  bars: { win: winBars, margin: marginBars, totals: totalsBars },
  verdicts: { [L6_ID]: { win: winV, margin: marginV, coherentPair: pairV, totals: totalsV } },
  rungsReportedNotPromotable: [L2_ID, L3_ID],
  implementationChecks: checks,
};
fs.writeFileSync(rel(EVAL_OUT), `${JSON.stringify(evaluation, null, 2)}\n`);
console.log(`held-out written: ${EVAL_OUT}`);
console.log(JSON.stringify({ verdicts: evaluation.verdicts, win: held.win, margin: held.margin, totals: held.totals, bars: evaluation.bars, forwardGuard: fgSum, season2026: sum2026 }, null, 1));
