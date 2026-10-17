/**
 * MLB-001 · OLD vs CORRECTED ENGINE RULES on the historical forecasts of record (founder decision 6).
 *
 * For every graded MLB game, the forecast of record is the full-game artifact game whose `artifactHash` the
 * graded prediction row carried. Its inputs are REBUILT from the git tree that first committed that hash (board,
 * team markets and the lineup archive exactly as they stood in that commit), with the clock set to the artifact's own
 * generatedAt. Only a rebuild whose legacy-engine hash equals the published hash is accepted, which proves the inputs
 * are the ones that were consumed; then the same inputs are played under OFFICIAL_RULES_2026 with the same seed, so
 * every difference comes from the rules alone.
 *
 * Read-only: nothing is written outside this directory, and no published forecast or grade is touched.
 * Descriptive only: an in-sample comparison on graded games is not promotion evidence.
 *
 * Run (from app/): npx tsx ../docs/research/mlb/mlb-001/rule-corrections/compare-engine-rules.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gameInputsFromBoard, resolveRuleset } from "../../../../../app/src/lib/mlb/full-game/board-adapter.ts";
import { selectConfirmedLineup } from "../../../../../app/src/lib/mlb/full-game/confirmed-lineup.ts";
import { simulateFullGame } from "../../../../../app/src/lib/mlb/full-game/simulate.ts";
import { DEFAULT_ENGINE_PARAMS, OFFICIAL_RULES_2026 } from "../../../../../app/src/lib/mlb/full-game/engine.ts";
import { stableHash } from "../../../../../app/src/lib/game-simulations/rng.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../../..");
const git = (...a) => execFileSync("git", a, { cwd: REPO, maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] }).toString();
const gitOr = (fallback, ...a) => { try { return git(...a); } catch { return fallback; } };
const gitJson = (sha, rel) => { try { return JSON.parse(git("show", `${sha}:${rel}`)); } catch { return null; } };

const graded = fs.readFileSync(path.join(REPO, "app/public/data/mlb/results/game-predictions-graded.jsonl"), "utf8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l));
const games = new Map();
for (const r of graded) {
  if (!games.has(r.gamePk)) games.set(r.gamePk, { gamePk: r.gamePk, date: r.date, src: r.forecastSource, actual: r.actual, firstPitch: r.firstPitchUtc, rows: {} });
  games.get(r.gamePk).rows[r.market] = r;
}
const calendar = JSON.parse(fs.readFileSync(path.join(REPO, "app/public/data/mlb/season-state.json"), "utf8")).calendar;

// The prediction revision a graded row names → that revision's prediction for the game (carries the artifactHash).
const predCache = new Map();
function predictionsAt(src, date) {
  if (predCache.has(src)) return predCache.get(src);
  const [kind, rest] = [src.slice(0, src.indexOf(":")), src.slice(src.indexOf(":") + 1)];
  let a = null;
  if (kind === "git") a = gitJson(rest, `app/public/data/mlb/predictions/${date}.json`);
  else if (kind === "snapshot") { try { a = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/mlb/prediction-snapshots", rest), "utf8")); } catch { a = null; } }
  const m = a ? new Map(a.predictions.map((p) => [p.gamePk, p])) : null;
  predCache.set(src, m);
  return m;
}

// Every revision of a date's full-game file, OLDEST first: hash → the commit that FIRST published it.
const firstSeen = new Map();
const datesDone = new Set();
function indexDate(date) {
  if (datesDone.has(date)) return;
  datesDone.add(date);
  const rel = `app/public/data/mlb/full-game-simulations/${date}.json`;
  for (const sha of git("log", "--reverse", "--format=%H", "--", rel).split("\n").filter(Boolean)) {
    const a = gitJson(sha, rel);
    if (!a) continue;
    for (const g of a.games ?? []) if (g.artifactHash && !firstSeen.has(g.artifactHash)) firstSeen.set(g.artifactHash, { sha, artifact: a, game: g });
  }
}

// The generator's own input construction (scripts/generate-mlb-full-game-simulations.mjs), at a commit.
const inputCache = new Map();
function inputsAt(sha, artifact) {
  const key = `${sha}|${artifact.generatedAt}`;
  if (inputCache.has(key)) return inputCache.get(key);
  const date = artifact.date;
  const board = gitJson(sha, `app/public/data/mlb/boards/${date}.json`);
  if (!board || stableHash(board) !== artifact.sourceBoardHash) { inputCache.set(key, null); return null; }
  const nowIso = artifact.generatedAt;
  const startedByNow = new Set(board.games.filter((g) => g.gameDate && Date.parse(g.gameDate) <= Date.parse(nowIso)).map((g) => g.gamePk));
  const boundedBoard = { ...board, games: board.games.map((g) => (startedByNow.has(g.gamePk) ? { ...g, startedBeforeGeneration: true } : g)) };
  const tm = gitJson(sha, `app/public/data/mlb/team-markets/${date}.json`);
  const marketByGamePk = new Map();
  if (tm?.games && typeof tm.games === "object") {
    const oddsIdByGamePk = new Map();
    for (const l of board.leans ?? []) if (l.gamePk != null && l.gameId) oddsIdByGamePk.set(l.gamePk, l.gameId);
    const byOddsId = new Map(Object.entries(tm.games));
    for (const g of board.games) {
      const t = byOddsId.get(oddsIdByGamePk.get(g.gamePk));
      if (!t) continue;
      marketByGamePk.set(g.gamePk, {
        bookmaker: t.bookmaker ?? null,
        capturedAt: tm.generatedAt ?? null,
        moneyline: t.moneyline ? { home: t.moneyline.home?.noVigProb ?? null, away: t.moneyline.away?.noVigProb ?? null } : null,
        total: t.total ? { line: t.total.line ?? null, over: t.total.over?.noVigProb ?? null } : null,
        runLine: t.runLine ? { line: t.runLine.line ?? null, homeCover: t.runLine.home?.coverNoVigProb ?? null } : null,
      });
    }
  }
  // The lineup archive is immutable and timestamped, but it is committed by a SEPARATE job after the run reads it,
  // so the generating commit's tree does not hold it. Read it from the working tree and keep only captures the run
  // could have seen (capturedAt ≤ the artifact's generatedAt); the numeric reproduction below verifies the choice.
  const confirmedByGamePk = new Map();
  const dir = path.join(REPO, `data/internal/mlb/pregame-archive/pregame-features/lineup/${date}`);
  const byGame = new Map();
  let files = [];
  try { files = fs.readdirSync(dir).filter((x) => x.endsWith(".json")); } catch { files = []; }
  for (const f of files) {
    let snap = null;
    try { snap = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
    if (!Number.isFinite(snap?.gamePk) || !(Date.parse(snap.capturedAt) <= Date.parse(nowIso))) continue;
    if (!byGame.has(snap.gamePk)) byGame.set(snap.gamePk, []);
    byGame.get(snap.gamePk).push(snap);
  }
  for (const [pk, snaps] of byGame) {
    const picked = selectConfirmedLineup(snaps);
    if (picked.away || picked.home) confirmedByGamePk.set(pk, picked);
  }
  const boardByPk = new Map(board.games.map((g) => [g.gamePk, g]));
  const build = (confirmed) => new Map(gameInputsFromBoard(boundedBoard, marketByGamePk, confirmed).map((i) => [i.gamePk, { input: i, boardGame: boardByPk.get(i.gamePk) }]));
  const inputs = build(confirmedByGamePk);
  // Second path, per game: confirmed sides as the INPUT SNAPSHOT recorded them (see confirmedFromSnapshot).
  inputs.withConfirmed = (gamePk, sides) => build(new Map([...confirmedByGamePk, [gamePk, sides]])).get(gamePk);
  inputCache.set(key, inputs);
  return inputs;
}

/*
 * The lineup captures a run consumed are not always in the repository: the capture and the simulation run in the
 * same job and the capture files were not all committed (2026-09-29 CHC @ SD: the 22:32Z forecast used confirmed
 * orders captured at 22:32:21Z; the archive holds only earlier, unposted captures). From 2026-09-26 the input
 * snapshot records, per published artifactHash, the confirmed order consumed (player ids in slot order + capture
 * instant). Names are read from the same published forecast's box score. The rebuild is still accepted only if the
 * legacy engine then reproduces every simulated number.
 */
const snapshotCache = new Map();
function confirmedFromSnapshot(date, artifactHash, published) {
  if (!snapshotCache.has(date)) {
    let doc = null;
    try { doc = JSON.parse(fs.readFileSync(path.join(REPO, `data/internal/mlb/input-snapshots/${date}.json`), "utf8")); } catch { doc = null; }
    const rows = doc ? (Array.isArray(doc.games) ? doc.games : Object.values(doc.games ?? {})) : [];
    snapshotCache.set(date, new Map(rows.map((r) => [r.artifactHash, r])));
  }
  const row = snapshotCache.get(date).get(artifactHash);
  if (!row) return null;
  const names = new Map((published.players?.batters ?? []).map((b) => [b.playerId, b.name]));
  const side = (x) => {
    if (x?.source !== "confirmed" || !x.capturedAt || x.batterIds?.length !== 9 || x.batterIds.some((id) => !names.has(id))) return null;
    return { batters: x.batterIds.map((id, i) => ({ playerId: id, name: names.get(id), position: null, battingOrderSlot: i + 1 })), capturedAt: x.capturedAt, minutesToFirstPitch: x.minutesToFirstPitch ?? null };
  };
  const sides = { away: side(row.away), home: side(row.home) };
  return sides.away || sides.home ? sides : null;
}

const OFFICIAL = { ...DEFAULT_ENGINE_PARAMS, rules: OFFICIAL_RULES_2026 };
const NUMERIC = ["status", "runCount", "winProbability", "runs", "totalRuns", "runDifferential", "runLine", "teamTotals", "finalScores", "extraInningsProbability"];
const stripRateSource = (players) => players && {
  batters: players.batters.map(({ rateSource, ...b }) => b),
  pitchers: players.pitchers.map(({ rateSource, ...p }) => p),
};
const sameNumbers = (a, b) =>
  NUMERIC.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k])) &&
  JSON.stringify(stripRateSource(a.players)) === JSON.stringify(stripRateSource(b.players));
const out = [];
const notReproduced = [];
const tally = { games: games.size, noPrediction: 0, noArtifact: 0, boardMismatch: 0, notReproduced: 0, reproduced: 0, unavailable: 0 };
let done = 0;
const ONLY = process.env.ONLY_DATES ? new Set(process.env.ONLY_DATES.split(",")) : null; // smoke runs only
for (const G of games.values()) {
  if (ONLY && !ONLY.has(G.date)) continue;
  done += 1;
  if (done % 50 === 0) console.error(`… ${done}/${games.size}`);
  const pred = predictionsAt(G.src, G.date)?.get(G.gamePk);
  if (!pred?.artifactHash) { tally.noPrediction += 1; continue; }
  indexDate(G.date);
  const hit = firstSeen.get(pred.artifactHash);
  if (!hit) { tally.noArtifact += 1; continue; }
  const inputs = inputsAt(hit.sha, hit.artifact);
  let entry = inputs?.get(G.gamePk);
  if (!entry) { tally.boardMismatch += 1; continue; }
  const opts = { runCount: hit.artifact.runCount, modelVersion: hit.artifact.modelVersion, simulationVersion: hit.artifact.simulationVersion, generatedAt: hit.artifact.generatedAt };
  let legacy = simulateFullGame(entry.input, opts);
  let lineupBasis = "ARCHIVE";
  if (legacy.artifactHash !== pred.artifactHash && !sameNumbers(legacy, hit.game)) {
    const sides = confirmedFromSnapshot(G.date, pred.artifactHash, hit.game);
    const alt = sides ? inputs.withConfirmed(G.gamePk, sides) : null;
    if (alt) {
      const altLegacy = simulateFullGame(alt.input, opts);
      if (altLegacy.artifactHash === pred.artifactHash || sameNumbers(altLegacy, hit.game)) { entry = alt; legacy = altLegacy; lineupBasis = "INPUT_SNAPSHOT"; }
    }
  }
  /* Reproduction. Byte-identical when the code has not changed since; otherwise the SIMULATED NUMBERS must be
     identical: TRUTH-001 (#1037) later added a per-batter `rateSource` label and reworded completeness notes, which
     change the hash but not one simulated value. Anything else that differs is not accepted. */
  const basis = legacy.artifactHash === pred.artifactHash ? "HASH" : sameNumbers(legacy, hit.game) ? "SIMULATED_NUMBERS" : null;
  if (!basis) {
    tally.notReproduced += 1;
    const fields = [...NUMERIC, "players"].filter((k) => k === "players"
      ? JSON.stringify(stripRateSource(legacy.players)) !== JSON.stringify(stripRateSource(hit.game.players))
      : JSON.stringify(legacy[k]) !== JSON.stringify(hit.game[k]));
    const lineupSource = (g) => `${g.completeness?.awayLineupSource ?? "?"}/${g.completeness?.homeLineupSource ?? "?"}`;
    notReproduced.push({ gamePk: G.gamePk, date: G.date, modelVersion: hit.artifact.modelVersion, differs: fields,
      lineupSource: { published: lineupSource(hit.game), rebuilt: lineupSource(legacy) },
      level: { published: hit.game.completeness?.level ?? null, rebuilt: legacy.completeness?.level ?? null } });
    continue;
  }
  tally.reproduced += 1;
  tally[`reproducedBy_${basis}`] = (tally[`reproducedBy_${basis}`] ?? 0) + 1;
  tally[`lineupFrom_${lineupBasis}`] = (tally[`lineupFrom_${lineupBasis}`] ?? 0) + 1;
  const rs = resolveRuleset(entry.boardGame ?? { date: G.date }, calendar);
  const official = simulateFullGame({ ...entry.input, ...rs }, { ...opts, engine: OFFICIAL });
  if (legacy.status === "unavailable" || official.status === "unavailable") { tally.unavailable += 1; continue; }
  // runLine[line].homeCover = P(home wins by more than `line`); home +1.5 covers unless away wins by 2+.
  const at15 = (g) => g.runLine.find((x) => x.line === 1.5) ?? null;
  const minus15 = (g) => at15(g)?.homeCover ?? null;
  const plus15 = (g) => (at15(g) ? Number((1 - at15(g).awayCover).toFixed(3)) : null);
  out.push({
    gamePk: G.gamePk, date: G.date, ruleset: rs.ruleset, rulesetBasis: rs.rulesetBasis,
    publishedHash: pred.artifactHash, reproducedBy: basis, lineupBasis, firstPublishedIn: hit.sha.slice(0, 12), modelVersion: hit.artifact.modelVersion,
    actual: G.actual,
    legacy: { pHome: legacy.winProbability.home, meanTotal: legacy.totalRuns.mean, extras: legacy.extraInningsProbability, homeMinus15: minus15(legacy), homePlus15: plus15(legacy) },
    official: { pHome: official.winProbability.home, meanTotal: official.totalRuns.mean, extras: official.extraInningsProbability, homeMinus15: minus15(official), homePlus15: plus15(official), discardedIncomplete: official.engineRules?.discardedIncomplete ?? null },
  });
}

fs.writeFileSync(path.join(HERE, "comparison-rows.jsonl"), out.map((r) => JSON.stringify(r)).join("\n") + "\n");
fs.writeFileSync(path.join(HERE, "not-reproduced.jsonl"), notReproduced.map((r) => JSON.stringify(r)).join("\n") + "\n");

// Summary by ruleset: mean shifts, and winner scoring on the same reproduced games (descriptive, in-sample).
const clampP = (p) => Math.min(1 - 1e-6, Math.max(1e-6, p));
const summary = { tally, byRuleset: {} };
for (const rs of ["REGULAR_SEASON", "POSTSEASON", "ALL"]) {
  const rows = out.filter((r) => rs === "ALL" || r.ruleset === rs);
  if (!rows.length) continue;
  const mean = (f) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
  const maxAbs = (f) => rows.reduce((m, r) => Math.max(m, Math.abs(f(r))), 0);
  const ll = (k) => mean((r) => { const p = clampP(r[k].pHome); return r.actual.winner === "home" ? -Math.log(p) : -Math.log(1 - p); });
  const br = (k) => mean((r) => (r[k].pHome - (r.actual.winner === "home" ? 1 : 0)) ** 2);
  const totalAbsErr = (k) => mean((r) => Math.abs(r[k].meanTotal - (r.actual.homeRuns + r.actual.awayRuns)));
  summary.byRuleset[rs] = {
    games: rows.length,
    pHome: { legacyMean: mean((r) => r.legacy.pHome), officialMean: mean((r) => r.official.pHome), meanShift: mean((r) => r.official.pHome - r.legacy.pHome), maxAbsShift: maxAbs((r) => r.official.pHome - r.legacy.pHome) },
    meanTotal: { legacyMean: mean((r) => r.legacy.meanTotal), officialMean: mean((r) => r.official.meanTotal), meanShift: mean((r) => r.official.meanTotal - r.legacy.meanTotal), maxAbsShift: maxAbs((r) => r.official.meanTotal - r.legacy.meanTotal) },
    extras: { legacyMean: mean((r) => r.legacy.extras), officialMean: mean((r) => r.official.extras) },
    homeMinus15: { legacyMean: mean((r) => r.legacy.homeMinus15 ?? 0), officialMean: mean((r) => r.official.homeMinus15 ?? 0), maxAbsShift: maxAbs((r) => (r.official.homeMinus15 ?? 0) - (r.legacy.homeMinus15 ?? 0)) },
    winnerLogLoss: { legacy: ll("legacy"), official: ll("official"), coin: Math.log(2) },
    winnerBrier: { legacy: br("legacy"), official: br("official"), coin: 0.25 },
    totalMeanAbsError: { legacy: totalAbsErr("legacy"), official: totalAbsErr("official") },
    discardedIncompleteTotal: rows.reduce((s, r) => s + (r.official.discardedIncomplete ?? 0), 0),
  };
}
fs.writeFileSync(path.join(HERE, "comparison-summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
