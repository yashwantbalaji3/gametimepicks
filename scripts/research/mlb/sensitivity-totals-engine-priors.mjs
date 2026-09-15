#!/usr/bin/env node
/**
 * P317 — MLB game totals: engine-prior sensitivity study. DEV ONLY · SECOND LOOK.
 *
 * The totals diagnosis (totals-overconfidence-diagnosis.json) named a LEVEL defect: the published full-game engine
 * (lib/mlb/full-game) simulates ~7.8 runs a game on the 2026 graded record while the league scored ~8.9. This
 * script asks WHICH documented league approximation inside that engine pulls the level down, by re-simulating
 * every graded game through the SAME engine (EngineParams, engine.ts) under one mechanism at a time and under
 * bundles, with common random numbers (same seed per game as production).
 *
 * Inputs are rebuilt as the published artifact saw them: the board and the team-markets comparison are read from the
 * git revision that first carried each game's committed artifactHash; the confirmed batting orders come from the
 * committed lineup archive, using the latest snapshot captured at or before that artifact's generation instant.
 * Two facts keep this from being a byte-for-byte hash replay, and both are reported rather than hidden: the adapter
 * gained a `startedBeforeGeneration` field on 2026-09-07 (older artifacts lack it, so their hash cannot match
 * current code), and the lineup-refresh job simulates on a capture it does not commit (the next committed
 * pre-first-pitch snapshot is used as that capture's twin, and the game is counted as such). The PARITY GATE is
 * therefore on the simulated outputs: the control must reproduce every committed game's run distributions, win
 * probability, run line, team totals, final scores, extras rate and player lines exactly.
 *
 * ⚠ The 2026 graded record is SEEN (scorecard, /results, the diagnosis). Every number here is development evidence
 * on a second look — never a candidate score, a bar, or an adoption. The clean population is forward.
 *
 * Run from app/:  npx tsx ../scripts/research/mlb/sensitivity-totals-engine-priors.mjs [--runs 10000] [--limit N]
 *                 [--configs id,id] [--out ../data/internal/research/mlb/reports/totals-engine-prior-sensitivity.json]
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gameInputsFromBoard } from "../../../app/src/lib/mlb/full-game/board-adapter.ts";
import { selectConfirmedLineup } from "../../../app/src/lib/mlb/full-game/confirmed-lineup.ts";
import { simulateFullGame } from "../../../app/src/lib/mlb/full-game/simulate.ts";
import { DEFAULT_ENGINE_PARAMS } from "../../../app/src/lib/mlb/full-game/engine.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const argOf = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };
const RUNS = Number(argOf("--runs") ?? 10000);
const LIMIT = argOf("--limit") ? Number(argOf("--limit")) : Infinity;
const ONLY = argOf("--configs") ? new Set(argOf("--configs").split(",")) : null;
const OUT = argOf("--out") ?? "data/internal/research/mlb/reports/totals-engine-prior-sensitivity.json";
const LEDGER = "app/public/data/mlb/results/game-predictions-graded.jsonl";
const SIM_FILE = (date) => `app/public/data/mlb/full-game-simulations/${date}.json`;
const BOARD_FILE = (date) => `app/public/data/mlb/boards/${date}.json`;
const TM_FILE = (date) => `app/public/data/mlb/team-markets/${date}.json`;
const LINEUP_DIR = (date) => `data/internal/mlb/pregame-archive/pregame-features/lineup/${date}`;

const git = (...a) => execFileSync("git", a, { cwd: ROOT, maxBuffer: 512 * 1024 * 1024 }).toString();
const gitShow = (sha, p) => { try { return JSON.parse(git("show", `${sha}:${p}`)); } catch { return null; } };
const gitLs = (sha, dir) => { try { return git("ls-tree", "--name-only", "-r", sha, "--", dir).trim().split("\n").filter(Boolean); } catch { return []; } };

/* ── the graded population (totals rows whose forecast of record is a prediction snapshot) ─────── */
const rows = fs.readFileSync(rel(LEDGER), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
  .filter((r) => r.market === "total" && r.line != null && r.actual && /^snapshot:/.test(r.forecastSource ?? ""));
const snapCache = new Map();
function snapshotPrediction(r) {
  const m = /^snapshot:(\d{4}-\d{2}-\d{2})\/(snapshot-\d{12}\.json)$/.exec(r.forecastSource ?? "");
  if (!m) return null;
  const p = rel(`data/internal/mlb/prediction-snapshots/${m[1]}/${m[2]}`);
  if (!snapCache.has(p)) { try { snapCache.set(p, JSON.parse(fs.readFileSync(p, "utf8"))); } catch { snapCache.set(p, null); } }
  return snapCache.get(p)?.predictions?.find((x) => String(x.gamePk) === String(r.gamePk)) ?? null;
}

/* ── the revision that FIRST carried each game's hash (a later revision may carry it forward verbatim) ── */
const revCache = new Map();
function revisionsFor(date) {
  if (revCache.has(date)) return revCache.get(date);
  const shas = git("log", "--format=%H", "--", SIM_FILE(date)).trim().split("\n").filter(Boolean).reverse(); // oldest first
  const revs = [];
  for (const sha of shas) {
    const doc = gitShow(sha, SIM_FILE(date));
    if (!doc) continue;
    revs.push({ sha, doc, games: new Map((doc.games ?? []).map((g) => [String(g.gamePk), g])) });
  }
  revCache.set(date, revs);
  return revs;
}

/* ── inputs exactly as generate-mlb-full-game-simulations.mjs built them at that revision ───────── */
const lineupCache = new Map(); // date → every committed snapshot (HEAD), by gamePk
function lineupSnapshots(date) {
  if (lineupCache.has(date)) return lineupCache.get(date);
  const byGame = new Map();
  try {
    for (const f of fs.readdirSync(rel(LINEUP_DIR(date))).filter((x) => x.endsWith(".json"))) {
      let snap; try { snap = JSON.parse(fs.readFileSync(rel(`${LINEUP_DIR(date)}/${f}`), "utf8")); } catch { continue; }
      if (!Number.isFinite(snap?.gamePk)) continue;
      if (!byGame.has(snap.gamePk)) byGame.set(snap.gamePk, []);
      byGame.get(snap.gamePk).push(snap);
    }
  } catch { /* no archive for the date */ }
  lineupCache.set(date, byGame);
  return byGame;
}
/** The confirmed sides a generation at `nowIso` could see; `twin` lets a side use the NEXT committed pre-first-pitch
 *  capture when the committed artifact says that side was confirmed but nothing committed by then shows it. */
function confirmedFor(date, gamePk, nowIso, twin) {
  const snaps = lineupSnapshots(date).get(gamePk) ?? [];
  const seen = snaps.filter((s) => Date.parse(s.capturedAt) <= Date.parse(nowIso));
  const picked = selectConfirmedLineup(seen);
  if (!twin) return picked;
  const later = snaps.filter((s) => Date.parse(s.capturedAt) > Date.parse(nowIso)).sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
  const out = { away: picked.away, home: picked.home };
  for (const side of ["away", "home"]) {
    if (out[side] || !twin[side]) continue;
    for (const s of later) { const p = selectConfirmedLineup([s]); if (p[side]) { out[side] = p[side]; break; } }
  }
  return out;
}
const boardCache = new Map();
function boardAt(date, sha, doc) {
  const key = `${date}@${sha}`;
  if (boardCache.has(key)) return boardCache.get(key);
  const board = gitShow(sha, BOARD_FILE(date));
  if (!board) { boardCache.set(key, null); return null; }
  const nowIso = doc.generatedAt;
  const startedByNow = new Set(board.games.filter((g) => g.gameDate && Number.isFinite(Date.parse(g.gameDate)) && Date.parse(g.gameDate) <= Date.parse(nowIso)).map((g) => g.gamePk));
  const boundedBoard = { ...board, games: board.games.map((g) => (startedByNow.has(g.gamePk) ? { ...g, startedBeforeGeneration: true } : g)) };
  const teamMarkets = gitShow(sha, TM_FILE(date));
  const marketByGamePk = new Map();
  if (teamMarkets && teamMarkets.games && typeof teamMarkets.games === "object") {
    const oddsIdByGamePk = new Map();
    for (const l of board.leans) if (l.gamePk != null && l.gameId) oddsIdByGamePk.set(l.gamePk, l.gameId);
    const byOddsId = new Map(Object.entries(teamMarkets.games));
    for (const g of board.games) {
      const tm = oddsIdByGamePk.get(g.gamePk) ? byOddsId.get(oddsIdByGamePk.get(g.gamePk)) : null;
      if (!tm) continue;
      marketByGamePk.set(g.gamePk, {
        bookmaker: tm.bookmaker ?? null, capturedAt: teamMarkets.generatedAt ?? null,
        moneyline: tm.moneyline ? { home: tm.moneyline.home?.noVigProb ?? null, away: tm.moneyline.away?.noVigProb ?? null } : null,
        total: tm.total ? { line: tm.total.line ?? null, over: tm.total.over?.noVigProb ?? null } : null,
        runLine: tm.runLine ? { line: tm.runLine.line ?? null, homeCover: tm.runLine.home?.coverNoVigProb ?? null } : null,
      });
    }
  }
  const out = { boundedBoard, marketByGamePk };
  boardCache.set(key, out);
  return out;
}
/** One game's engine input as the artifact saw it. Returns the input plus whether a lineup twin was needed. */
function inputFor(date, sha, doc, committed) {
  const b = boardAt(date, sha, doc);
  if (!b) return null;
  const gamePk = committed.gamePk;
  const wants = { away: committed.completeness?.awayLineupSource === "confirmed", home: committed.completeness?.homeLineupSource === "confirmed" };
  const build = (confirmed) => gameInputsFromBoard(b.boundedBoard, b.marketByGamePk, new Map(confirmed.away || confirmed.home ? [[gamePk, confirmed]] : [])).find((i) => i.gamePk === gamePk);
  const seen = confirmedFor(date, gamePk, doc.generatedAt, null);
  let input = build(seen);
  let twin = false;
  if (input && ((wants.away && !seen.away) || (wants.home && !seen.home))) { input = build(confirmedFor(date, gamePk, doc.generatedAt, wants)); twin = true; }
  return input ? { input, twin } : null;
}

/* ── join ───────────────────────────────────────────────────────────────────────────────────────── */
const joined = [];
const unjoined = { noSnapshot: 0, noRevision: 0, noInputs: 0 };
for (const r of rows) {
  if (joined.length >= LIMIT) break;
  const pred = snapshotPrediction(r);
  if (!pred?.total || pred.total.overProbability == null) { unjoined.noSnapshot += 1; continue; }
  const rev = revisionsFor(r.date).find((x) => { const g = x.games.get(String(r.gamePk)); return g && g.artifactHash === pred.artifactHash && g.totalRuns?.distribution?.length; });
  if (!rev) { unjoined.noRevision += 1; continue; }
  const committed = rev.games.get(String(r.gamePk));
  const built = inputFor(r.date, rev.sha, rev.doc, committed);
  if (!built) { unjoined.noInputs += 1; continue; }
  joined.push({ date: r.date, gamePk: r.gamePk, line: r.line, actual: r.actual.homeRuns + r.actual.awayRuns, sha: rev.sha, doc: rev.doc, committed, input: built.input, lineupTwin: built.twin, prodPOver: pred.total.overProbability, prodPUnder: pred.total.underProbability, prodPick: pred.total.pick, marketOver: pred.total.marketImpliedOver ?? r.marketImpliedProbability ?? null });
}
console.log(`joined ${joined.length} of ${rows.length} snapshot-cited totals rows (unjoined ${JSON.stringify(unjoined)})`);

/* ── the parity gate: the control must reproduce every committed game's simulated outputs ───────── */
const optsFor = (g, engine) => ({ runCount: g.doc.runCount ?? RUNS, modelVersion: g.doc.modelVersion, simulationVersion: g.doc.simulationVersion, generatedAt: g.doc.generatedAt, engine });
const OUTPUT_FIELDS = ["status", "runCount", "winProbability", "runs", "totalRuns", "runDifferential", "runLine", "teamTotals", "finalScores", "extraInningsProbability", "players"];
let parityOk = 0, hashOk = 0; const parityBad = [];
for (const g of joined) {
  const sim = simulateFullGame(g.input, optsFor(g, undefined));
  if (sim.artifactHash === g.committed.artifactHash) hashOk += 1;
  const bad = OUTPUT_FIELDS.filter((k) => JSON.stringify(sim[k]) !== JSON.stringify(g.committed[k]));
  if (!bad.length) parityOk += 1;
  else parityBad.push({ date: g.date, gamePk: g.gamePk, fields: bad, committedMean: g.committed.totalRuns?.mean, rebuiltMean: sim.totalRuns?.mean, twin: g.lineupTwin });
}
const twins = joined.filter((g) => g.lineupTwin).length;
console.log(`parity: ${parityOk}/${joined.length} committed games reproduced on every simulated output (${hashOk} byte-identical hashes; ${twins} used a lineup twin)${parityBad.length ? ` · MISMATCH ${JSON.stringify(parityBad.slice(0, 5))}` : ""}`);
/* A game whose published inputs cannot be rebuilt (its in-job capture was never committed and the twin differs) is
   EXCLUDED, not approximated: the study population is exactly the games the published engine reproduces. */
const excluded = parityBad.map((b) => ({ date: b.date, gamePk: b.gamePk, fields: b.fields }));
const study = joined.filter((g) => !parityBad.some((b) => b.date === g.date && b.gamePk === g.gamePk));
console.log(`study population ${study.length} (${excluded.length} excluded: inputs not reproducible)`);

/* ── configurations: one documented mechanism at a time, then bundles ───────────────────────────── */
const P = DEFAULT_ENGINE_PARAMS;
const merge = (over) => ({ league: { ...P.league, ...(over.league ?? {}) }, advancement: { ...P.advancement, ...(over.advancement ?? {}) }, starter: { ...P.starter, ...(over.starter ?? {}) } });
const FALLBACK = { expHits: 0.7, expTotalBases: 1.1 }; // board-adapter FALLBACK_BATTER rates (a batter with no posted line)
const isFallbackRated = (b) => b.expHits === FALLBACK.expHits && b.expTotalBases === FALLBACK.expTotalBases;
const CONFIGS = [
  { id: "C0", label: "control — the published engine", anchor: "as committed", over: {}, input: null },
  { id: "W", label: "walk + HBP rate 0.085 → 0.093", anchor: "documented 2020s league: BB ≈ 8.2% + HBP ≈ 1.1% of PA", over: { league: { WALK_RATE: 0.093 } } },
  { id: "E", label: "reach on error 0 → 0.009 per PA", anchor: "documented ≈ 0.35 reached-on-error per team-game over ≈ 38 PA", over: { league: { REACH_ON_ERROR_RATE: 0.009 } } },
  { id: "B", label: "bases-per-hit fallback 1.58 → 1.63", anchor: "documented 2020s league TB/H (SLG ÷ AVG) ≈ 1.63; only batters with no total-bases line", over: { league: { BASES_PER_HIT_FALLBACK: 1.63 } } },
  { id: "D", label: "double plays 0 → 0.12 per opportunity", anchor: "documented ≈ 0.72 GIDP per team-game (≈ 12% of runner-on-first, <2-out outs); LOWERS runs", over: { advancement: { groundIntoDoublePlay: 0.12 } } },
  { id: "F", label: "free advance 0 → 0.013 per PA with runners on", anchor: "documented WP + PB + balk ≈ 0.5 per team-game over ≈ 38 PA", over: { advancement: { freeAdvance: 0.013 } } },
  { id: "S", label: "PA divisor 3.85 → 4.27 (self-consistent)", anchor: "the engine's own realised PA per lineup slot; makes simulated hits equal the board's projections; LOWERS runs", over: { league: { PA_PER_GAME: 4.27 } } },
  { id: "P", label: "productive out scores from third 0.4 → 0.5", anchor: "sensitivity only — no documented anchor chosen", over: { advancement: { productiveOutScoresFromThird: 0.5 } } },
  { id: "X", label: "starter pulled after 22 batters (was 25)", anchor: "documented 2020s starters ≈ 5.2 IP ≈ 22 BF; sensitivity", over: { starter: { maxBattersFaced: 22 } } },
  { id: "H", label: "input level: hits ×1.037, total bases ×1.069", anchor: "SECOND-LOOK FIT: settled actual ÷ board projection on the seen 2026 record (calibration rows 08-23..09-14)", over: {}, input: (b) => (isFallbackRated(b) ? b : { ...b, expHits: b.expHits != null ? b.expHits * 1.037 : null, expTotalBases: b.expTotalBases != null ? b.expTotalBases * 1.069 : null }) },
  { id: "R", label: "un-lined batters at 0.80 hits / 1.25 TB (was 0.70 / 1.10)", anchor: "sensitivity — a league bottom-third regular rather than replacement level", over: {}, input: (b) => (isFallbackRated(b) ? { ...b, expHits: 0.8, expTotalBases: 1.25 } : b) },
  { id: "BUNDLE_LEAGUE", label: "W + E + B + D + F", anchor: "every mechanism with a documented league anchor, in both directions", over: { league: { WALK_RATE: 0.093, REACH_ON_ERROR_RATE: 0.009, BASES_PER_HIT_FALLBACK: 1.63 }, advancement: { groundIntoDoublePlay: 0.12, freeAdvance: 0.013 } } },
  { id: "BUNDLE_LEAGUE_H", label: "W + E + B + D + F + H", anchor: "the documented bundle plus the second-look input level", over: { league: { WALK_RATE: 0.093, REACH_ON_ERROR_RATE: 0.009, BASES_PER_HIT_FALLBACK: 1.63 }, advancement: { groundIntoDoublePlay: 0.12, freeAdvance: 0.013 } }, input: (b) => (isFallbackRated(b) ? b : { ...b, expHits: b.expHits != null ? b.expHits * 1.037 : null, expTotalBases: b.expTotalBases != null ? b.expTotalBases * 1.069 : null }) },
].filter((c) => !ONLY || ONLY.has(c.id));

/* ── metrics (the diagnosis's definitions, so the two reports read alike) ───────────────────────── */
const r4 = (v) => (Number.isFinite(v) ? Number(v.toFixed(4)) : null);
const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sdOf = (a) => { const m = meanOf(a); return a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) : null; };
const clip = (p) => Math.min(1 - 1e-6, Math.max(1e-6, p));
const logLoss = (p, y) => -Math.log(clip(y ? p : 1 - p));
const slope = (xs, ys) => { const mx = meanOf(xs), my = meanOf(ys); let sxy = 0, sxx = 0; for (let i = 0; i < xs.length; i += 1) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; } return sxx ? sxy / sxx : null; };
function reliability(pairs) {
  const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, o: 0 }));
  for (const [p, o] of pairs) { const b = bins[Math.min(9, Math.floor(p * 10))]; b.n += 1; b.p += p; b.o += o; }
  const n = pairs.length;
  return { n, ece: r4(bins.reduce((s, b) => s + (b.n ? (b.n / n) * Math.abs(b.p / b.n - b.o / b.n) : 0), 0)) };
}
function scoreGame(g, sim) {
  const dist = sim.totalRuns.distribution.map((b) => ({ value: Number(b.value), p: Number(b.probability) }));
  const mass = dist.reduce((s, b) => s + b.p, 0);
  const mean = dist.reduce((s, b) => s + b.value * b.p, 0) / mass;
  const sd = Math.sqrt(dist.reduce((s, b) => s + (b.value - mean) ** 2 * b.p, 0) / mass);
  const cdfBelow = dist.filter((b) => b.value < g.actual).reduce((s, b) => s + b.p, 0) / mass;
  const pAt = dist.filter((b) => b.value === g.actual).reduce((s, b) => s + b.p, 0) / mass;
  const pOver = dist.filter((b) => b.value > g.line).reduce((s, b) => s + b.p, 0) / mass;
  const pUnder = dist.filter((b) => b.value < g.line).reduce((s, b) => s + b.p, 0) / mass;
  const bat = sim.players.batters;
  const perTeam = (k) => bat.reduce((s, b) => s + b[k], 0) / 2;
  return { date: g.date, gamePk: g.gamePk, line: g.line, actual: g.actual, mean, median: sim.totalRuns.median, sd, p10: sim.totalRuns.p10, p90: sim.totalRuns.p90, pit: cdfBelow + 0.5 * pAt, pOver, pUnder, over: g.actual > g.line ? 1 : g.actual < g.line ? 0 : null, marketOver: g.marketOver, month: g.date.slice(0, 7), hits: perTeam("hits"), walks: perTeam("walks"), homeRuns: perTeam("homeRuns"), paPerBatter: bat.reduce((s, b) => s + b.plateAppearances, 0) / bat.length, extras: sim.extraInningsProbability, level: sim.completeness.level };
}
function block(list) {
  const decided = list.filter((g) => g.over != null);
  const fixedOver = decided.map((g) => [g.pOver, g.over]);
  const chosen = decided.map((g) => (g.pOver >= g.pUnder ? [g.pOver, g.over] : [g.pUnder, 1 - g.over]));
  const market = decided.filter((g) => g.marketOver != null).map((g) => [g.marketOver, g.over]);
  const pitHist = Array.from({ length: 10 }, (_, i) => list.filter((g) => Math.min(9, Math.floor(g.pit * 10)) === i).length / (list.length || 1));
  return {
    n: list.length, decided: decided.length,
    level: { meanActualMinusMean: r4(meanOf(list.map((g) => g.actual - g.mean))), meanActualMinusMedian: r4(meanOf(list.map((g) => g.actual - g.median))), meanActual: r4(meanOf(list.map((g) => g.actual))), meanSimMean: r4(meanOf(list.map((g) => g.mean))), meanLine: r4(meanOf(list.map((g) => g.line))), slopeSimMeanOnLine: r4(slope(list.map((g) => g.line), list.map((g) => g.mean))), slopeActualOnLine: r4(slope(list.map((g) => g.line), list.map((g) => g.actual))) },
    dispersion: { actualSd: r4(sdOf(list.map((g) => g.actual))), meanSimSd: r4(meanOf(list.map((g) => g.sd))), sdOfActualMinusMean: r4(sdOf(list.map((g) => g.actual - g.mean))), coverageP10P90: r4(meanOf(list.map((g) => (g.actual >= g.p10 && g.actual <= g.p90 ? 1 : 0)))), meanWidthP10P90: r4(meanOf(list.map((g) => g.p90 - g.p10))), pitHistogram: pitHist.map(r4), pitTailMass: r4(pitHist[0] + pitHist[9]) },
    selection: { fixedOverEce: reliability(fixedOver).ece, chosenSideEce: reliability(chosen).ece, overRate: r4(meanOf(decided.map((g) => g.over))), meanPOver: r4(meanOf(decided.map((g) => g.pOver))), chosenHitRate: r4(meanOf(chosen.map(([, o]) => o))), chosenMeanShown: r4(meanOf(chosen.map(([p]) => p))), logLoss: { fixedOver: r4(meanOf(fixedOver.map(([p, y]) => logLoss(p, y)))), chosenSide: r4(meanOf(chosen.map(([p, y]) => logLoss(p, y)))), coin: r4(Math.log(2)), marketOver: market.length ? r4(meanOf(market.map(([p, y]) => logLoss(p, y)))) : null }, brier: { fixedOver: r4(meanOf(fixedOver.map(([p, y]) => (p - y) ** 2))), marketOver: market.length ? r4(meanOf(market.map(([p, y]) => (p - y) ** 2))) : null } },
    teamSanity: { hitsPerTeam: r4(meanOf(list.map((g) => g.hits))), walksPerTeam: r4(meanOf(list.map((g) => g.walks))), homeRunsPerTeam: r4(meanOf(list.map((g) => g.homeRuns))), paPerBatter: r4(meanOf(list.map((g) => g.paPerBatter))), extraInningsRate: r4(meanOf(list.map((g) => g.extras))) },
  };
}
const lineBand = (g) => (g.line <= 7.5 ? "≤7.5" : g.line <= 9 ? "8–9" : "≥9.5");
const groupBy = (list, f) => { const m = new Map(); for (const g of list) { const k = f(g); if (!m.has(k)) m.set(k, []); m.get(k).push(g); } return Object.fromEntries([...m].sort().map(([k, v]) => [k, block(v)])); };

/* ── run ────────────────────────────────────────────────────────────────────────────────────────── */
const results = [];
for (const c of CONFIGS) {
  const t0 = Date.now();
  const engine = merge(c.over);
  const scored = study.map((g) => {
    const input = c.input ? { ...g.input, awayLineup: g.input.awayLineup.map(c.input), homeLineup: g.input.homeLineup.map(c.input) } : g.input;
    const sim = simulateFullGame(input, { ...optsFor(g, engine), runCount: RUNS });
    return scoreGame(g, sim);
  });
  const overall = block(scored);
  results.push({ id: c.id, label: c.label, anchor: c.anchor, paramsOverride: c.over, inputTransform: c.input ? c.label : null, overall, byLineBand: groupBy(scored, lineBand), byMonth: groupBy(scored, (g) => g.month), seconds: Math.round((Date.now() - t0) / 1000) });
  const o = overall;
  console.log(`${c.id.padEnd(15)} sim ${o.level.meanSimMean.toFixed(3)} (actual ${o.level.meanActual.toFixed(3)}, line ${o.level.meanLine.toFixed(3)}) · level ${o.level.meanActualMinusMean >= 0 ? "+" : ""}${o.level.meanActualMinusMean.toFixed(3)} · slope ${o.level.slopeSimMeanOnLine} · sd ${o.dispersion.meanSimSd} · cov ${o.dispersion.coverageP10P90} · PIT tails ${o.dispersion.pitTailMass} · LL fixed ${o.selection.logLoss.fixedOver} chosen ${o.selection.logLoss.chosenSide} · ECE fixed ${o.selection.fixedOverEce} · hits/tm ${o.teamSanity.hitsPerTeam} bb ${o.teamSanity.walksPerTeam} hr ${o.teamSanity.homeRunsPerTeam} pa ${o.teamSanity.paPerBatter} · ${results.at(-1).seconds}s`);
}

const report = {
  schemaVersion: 1, artifact: "mlb-totals-engine-prior-sensitivity", dataClass: "PRIVATE_RESEARCH", program: "317", generatedAt: new Date().toISOString(),
  status: "DEV_ONLY · SECOND_LOOK — the 2026 graded record is SEEN; nothing here is a candidate score, a bar, or an adoption. Constants marked 'documented' come from public 2020s league rates, not from these outcomes; 'H' is fit on this seen record and says so.",
  method: "Each graded total row's forecast of record (the cited prediction snapshot) names an artifactHash; the git revision that first carried it supplies the board, team-markets comparison and lineup snapshots; inputs are rebuilt with the production adapter; the control reproduces every committed hash (parity gate) and every configuration re-simulates with the production seed per game (common random numbers).",
  runsPerGame: RUNS, population: { ledgerTotalRows: rows.length, joined: joined.length, unjoined, dates: [...new Set(joined.map((g) => g.date))].sort(), parity: { outputsReproduced: parityOk, byteIdenticalHashes: hashOk, lineupTwins: twins, of: joined.length, outputFields: OUTPUT_FIELDS, excluded }, studied: study.length },
  leagueReference: { runsPerGame2026: "committed StatsAPI linescores: July 8.848 (n 336) · August 8.703 (n 417) · September-to-date 9.624 (n 186); graded ledger all 614 totals: actual 8.894 vs posted line 8.338", note: "a level target is the season environment (≈ 8.7–8.9), not the hot September; the posted line itself ran ≈ 0.55 below actual this season" },
  directions: "level = actual − simulated mean (0 is right; positive = the engine is low) · slope = how much the simulated mean rises per point of posted line (actual rises ≈ 1) · coverage p10–p90 targets 0.80 · PIT tail mass targets 0.20 (higher = too tight) · log loss and Brier lower is better · ECE lower is better",
  configs: results,
};
fs.mkdirSync(path.dirname(rel(OUT)), { recursive: true });
fs.writeFileSync(rel(OUT), `${JSON.stringify(report, null, 2)}\n`);
console.log(`wrote ${OUT}`);
