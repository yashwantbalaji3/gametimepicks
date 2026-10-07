/**
 * freeze-mlb-slate-game.mjs — freeze ONE game's pregame 10,000-world forecast as a write-once receipt.
 *
 *   npx tsx app/scripts/research/freeze-mlb-slate-game.mjs --date 2026-10-07 --game 849833 [--write] [--now ISO]
 *
 * SHADOW / PRIVATE RESEARCH. Nothing public reads the receipt; it changes no published byte.
 *
 * WHAT IT RUNS. The canonical full-game engine (E3: plate appearance → base/out → inning → game) under the
 * REGISTERED P317 parameter set `mlb-fullgame-engine-league-rates-v1` — the run-level correction that has
 * been running forward in shadow since 2026-09-15 (engine-level-shadow-protocol.json). Same engine code,
 * same inputs, same seed as the generator's own P317 shadow row; no parameter is chosen here. The public
 * champion (default parameters) is run beside it for comparison only.
 *
 * WHAT IT FREEZES. Every world's (away, home) score, so winner, margin, run line and game total are read
 * from the same 10,000 games and can be re-read tomorrow without re-simulating. Plus the inputs the run
 * consumed, with their capture times, and convergence checks.
 *
 * THE BOUNDARY. A game whose first pitch is at or before --now is refused (and, with --write, recorded as a
 * missed freeze). An existing receipt is never rewritten.
 *
 * The input assembly below mirrors generate-mlb-full-game-simulations.mjs line for line, so the slate sees
 * exactly what the public generator would see at the same moment.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gameInputsFromBoard } from "../../src/lib/mlb/full-game/board-adapter.ts";
import { selectConfirmedLineup } from "../../src/lib/mlb/full-game/confirmed-lineup.ts";
import { simulateFullGame } from "../../src/lib/mlb/full-game/simulate.ts";
import { simulateGame, DEFAULT_ENGINE_PARAMS } from "../../src/lib/mlb/full-game/engine.ts";
import { SeededRng, stableHash } from "../../src/lib/game-simulations/rng.ts";
import { ENGINE_LEVEL_CANDIDATE_V1, engineParamsFor } from "../../src/lib/mlb/full-game/engine-candidates.ts";
import { headline, mean, quantiles, reconcile, runLineAt, shareSe, totalAtLine, totalHistogram } from "../../src/lib/mlb/full-game/world-summary.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REPO = path.join(APP, "..");
const DATA = path.join(APP, "public", "data");
const CHAMPION_VERSION = "mlb-fullgame-2026.08-pa-v2";
const SIMULATION_VERSION = 1;
const RUN_COUNT = 10000;
const CHECKPOINTS = [1000, 2500, 5000, 10000];
const REPLICATES = 4;
export const SLATE_MODEL_ID = `${CHAMPION_VERSION}+${ENGINE_LEVEL_CANDIDATE_V1.id}`;

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
};
const date = arg("--date") ?? new Date().toISOString().slice(0, 10);
const gameArg = arg("--game");
const write = process.argv.includes("--write");
const nowIso = arg("--now") ?? new Date().toISOString();
const outDir = path.join(REPO, "data/internal/research/mlb/playoff-slate", date);
const mirrorDir = arg("--mirror");

const readJson = (rel) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8"));
  } catch {
    return null;
  }
};
const sha256File = (rel) => crypto.createHash("sha256").update(fs.readFileSync(path.join(REPO, rel))).digest("hex");
const git = (cmd) => {
  try {
    return execSync(`git -C ${REPO} ${cmd}`, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
};

const board = readJson(`mlb/boards/${date}.json`);
if (!board || !Array.isArray(board.games)) {
  console.error(`[slate-freeze] no board for ${date}.`);
  process.exit(1);
}
const boardGame = board.games.find((g) => String(g.gamePk) === String(gameArg) || `${g.awayTeamAbbr}-${g.homeTeamAbbr}`.toLowerCase() === String(gameArg).toLowerCase());
if (!boardGame) {
  console.error(`[slate-freeze] game ${gameArg} is not on the ${date} board.`);
  process.exit(1);
}
const gamePk = boardGame.gamePk;
const firstPitch = boardGame.gameDate;

const receiptPath = path.join(outDir, `${gamePk}.json`);
if (fs.existsSync(receiptPath)) {
  console.error(`[slate-freeze] ${path.relative(REPO, receiptPath)} already exists — a frozen receipt is never rewritten.`);
  process.exit(2);
}

// ── THE BOUNDARY ──────────────────────────────────────────────────────────────────────────────────
if (!firstPitch || !Number.isFinite(Date.parse(firstPitch)) || Date.parse(firstPitch) <= Date.parse(nowIso)) {
  console.error(`[slate-freeze] ${gamePk} first pitch ${firstPitch} is not after now ${nowIso} — MISSED FREEZE, nothing simulated.`);
  if (write) {
    fs.mkdirSync(outDir, { recursive: true });
    const missPath = path.join(outDir, `${gamePk}.missed.json`);
    if (!fs.existsSync(missPath)) fs.writeFileSync(missPath, JSON.stringify({ gamePk, date, firstPitch, attemptedAt: nowIso, state: "MISSED_FREEZE", note: "No pregame forecast exists for this game in the slate. It is never backfilled." }, null, 2) + "\n");
  }
  process.exit(3);
}

// ── INPUTS (mirrors the public generator) ─────────────────────────────────────────────────────────
const startedByNow = new Set(
  board.games.filter((g) => g.gameDate && Number.isFinite(Date.parse(g.gameDate)) && Date.parse(g.gameDate) <= Date.parse(nowIso)).map((g) => g.gamePk),
);
const boundedBoard = { ...board, games: board.games.map((g) => (startedByNow.has(g.gamePk) ? { ...g, startedBeforeGeneration: true } : g)) };

const lineupDir = path.join(REPO, "data/internal/mlb/pregame-archive/pregame-features/lineup", date);
const confirmedByGamePk = new Map();
const lineupFilesSeen = [];
try {
  const snaps = [];
  for (const file of fs.readdirSync(lineupDir).filter((f) => f.endsWith(".json"))) {
    try {
      const snap = JSON.parse(fs.readFileSync(path.join(lineupDir, file), "utf8"));
      if (snap?.gamePk !== gamePk) continue;
      // Only what had been captured by --now may be used, whatever is on disk later.
      if (snap.capturedAt && Date.parse(snap.capturedAt) > Date.parse(nowIso)) continue;
      snaps.push(snap);
      lineupFilesSeen.push({ file, capturedAt: snap.capturedAt ?? null });
    } catch { /* torn snapshot */ }
  }
  const picked = selectConfirmedLineup(snaps);
  if (picked.away || picked.home) confirmedByGamePk.set(gamePk, picked);
} catch { /* no archive */ }

const teamMarkets = readJson(`mlb/team-markets/${date}.json`);
const marketByGamePk = new Map();
if (teamMarkets?.games && typeof teamMarkets.games === "object") {
  const lean = (board.leans ?? []).find((l) => l.gamePk === gamePk && l.gameId);
  const tm = lean ? teamMarkets.games[lean.gameId] : null;
  if (tm) {
    marketByGamePk.set(gamePk, {
      bookmaker: tm.bookmaker ?? null,
      capturedAt: teamMarkets.generatedAt ?? null,
      moneyline: tm.moneyline ? { home: tm.moneyline.home?.noVigProb ?? null, away: tm.moneyline.away?.noVigProb ?? null } : null,
      total: tm.total ? { line: tm.total.line ?? null, over: tm.total.over?.noVigProb ?? null } : null,
      runLine: tm.runLine ? { line: tm.runLine.line ?? null, homeCover: tm.runLine.home?.coverNoVigProb ?? null } : null,
    });
  }
}
if (teamMarkets?.generatedAt && Date.parse(teamMarkets.generatedAt) > Date.parse(nowIso)) {
  console.error(`[slate-freeze] team markets captured after --now; refusing to use them.`);
  process.exit(1);
}

const input = gameInputsFromBoard(boundedBoard, marketByGamePk, confirmedByGamePk).find((i) => i.gamePk === gamePk);
if (!input || input.completeness.level === "unavailable") {
  console.error(`[slate-freeze] ${gamePk} has no simulatable input: ${input?.completeness?.notes?.join(" ")}`);
  process.exit(1);
}

// ── THE WORLDS ────────────────────────────────────────────────────────────────────────────────────
const slateParams = engineParamsFor(ENGINE_LEVEL_CANDIDATE_V1);
const seed = `${input.date}|mlb-fullgame|${gamePk}|${CHAMPION_VERSION}|${SIMULATION_VERSION}`; // == simulateFullGame's seed
const runWorlds = (seedString, params, n) => {
  const rng = new SeededRng(seedString);
  const out = new Array(n);
  const extra = { extras: 0 };
  for (let i = 0; i < n; i += 1) {
    const r = simulateGame(input, rng, params);
    out[i] = { away: r.awayRuns, home: r.homeRuns };
    if (r.extra) extra.extras += 1;
  }
  return { worlds: out, extras: extra.extras / n };
};
const t0 = Date.now();
const { worlds, extras } = runWorlds(seed, slateParams, RUN_COUNT);
const line = input.market?.total?.line ?? null;
const rlLine = 1.5;

// Cross-check: the library path with the same seed and parameters must produce the same game.
const viaLibrary = simulateFullGame(input, { runCount: RUN_COUNT, modelVersion: CHAMPION_VERSION, simulationVersion: SIMULATION_VERSION, generatedAt: nowIso, engine: slateParams });
const champion = simulateFullGame(input, { runCount: RUN_COUNT, modelVersion: CHAMPION_VERSION, simulationVersion: SIMULATION_VERSION, generatedAt: nowIso });
const championWorlds = runWorlds(seed, DEFAULT_ENGINE_PARAMS, RUN_COUNT).worlds;

const totals = worlds.map((w) => w.away + w.home);
const awayRuns = worlds.map((w) => w.away);
const homeRuns = worlds.map((w) => w.home);
const margins = worlds.map((w) => w.home - w.away);
const rec = reconcile(worlds);
const homeWin = headline(worlds, line).homeWin;
const libraryAgrees =
  Math.abs(viaLibrary.winProbability.home - Math.round(homeWin * 1000) / 1000) < 1e-9 &&
  Math.abs(viaLibrary.totalRuns.mean - Math.round(mean(totals) * 100) / 100) < 1e-9 &&
  Math.abs(viaLibrary.runLine.find((r) => r.line === 1.5).homeCover - Math.round(runLineAt(worlds, 1.5).homeCover * 1000) / 1000) < 1e-9;

// Algebraic identities that must hold exactly when every number comes from the same worlds.
const tl = line == null ? null : totalAtLine(worlds, line);
const rl = runLineAt(worlds, rlLine);
const identities = {
  winnerSumsToOne: rec.winnerMass === 1,
  overUnderPushSumToOne: tl ? tl.counts.over + tl.counts.under + tl.counts.push === tl.counts.worlds : null,
  pushOnlyOnWholeLine: tl ? (Number.isInteger(line) ? true : tl.counts.push === 0) : null,
  meanTotalEqualsSumOfTeamMeans: Math.abs(mean(totals) - (mean(awayRuns) + mean(homeRuns))) < 1e-9,
  meanMarginEqualsDifference: Math.abs(mean(margins) - (mean(homeRuns) - mean(awayRuns))) < 1e-9,
  // home -1.5 covers ⊂ home wins; away +1.5 covers = away wins + home-by-one.
  runLineNestedInWinner: rl.homeCover <= homeWin + 1e-12,
  libraryPathReproduces: libraryAgrees,
};

// Convergence: prefix checkpoints of the frozen stream + independent replicate seeds at full size.
const checkpoints = CHECKPOINTS.map((n) => headline(worlds.slice(0, n), line, rlLine));
const replicates = Array.from({ length: REPLICATES }, (_, k) => headline(runWorlds(`${seed}|replicate-${k + 1}`, slateParams, RUN_COUNT).worlds, line, rlLine));
const spread = (key) => {
  const vals = [checkpoints.at(-1)[key], ...replicates.map((r) => r[key])].filter((v) => v != null);
  if (!vals.length) return null;
  return { min: Math.min(...vals), max: Math.max(...vals), range: Math.round((Math.max(...vals) - Math.min(...vals)) * 1e4) / 1e4 };
};
const n = RUN_COUNT;
const convergence = {
  checkpoints,
  replicateSeeds: replicates,
  seedToSeedRange: { homeWin: spread("homeWin"), over: spread("over"), push: spread("push"), homeCover: spread("homeCover"), meanTotal: spread("meanTotal") },
  monteCarloSe: {
    homeWin: Math.round(shareSe(homeWin, n) * 1e4) / 1e4,
    over: tl ? Math.round(shareSe(tl.over, n) * 1e4) / 1e4 : null,
    push: tl ? Math.round(shareSe(tl.push, n) * 1e4) / 1e4 : null,
    homeCover: Math.round(shareSe(rl.homeCover, n) * 1e4) / 1e4,
  },
  verdict: null,
};
const maxRange = Math.max(...["homeWin", "over", "homeCover"].map((k) => convergence.seedToSeedRange[k]?.range ?? 0));
convergence.verdict = maxRange <= 0.025 ? `STABLE: across 5 independent 10,000-world runs no headline probability moved more than ${(maxRange * 100).toFixed(1)} points` : `CHECK: a headline probability moved ${(maxRange * 100).toFixed(1)} points across seeds`;

const scoreCounts = new Map();
for (const w of worlds) scoreCounts.set(`${w.away}-${w.home}`, (scoreCounts.get(`${w.away}-${w.home}`) ?? 0) + 1);
const topScores = [...scoreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, c]) => {
  const [a, h] = k.split("-").map(Number);
  return { away: a, home: h, count: c, probability: Math.round((c / n) * 1e4) / 1e4 };
});
const ladder = [];
for (let L = 5.5; L <= 12.5; L += 1) ladder.push(totalAtLine(worlds, L));
if (line != null && Number.isInteger(line)) ladder.push(totalAtLine(worlds, line));
ladder.sort((a, b) => a.line - b.line);

const championTl = line == null ? null : totalAtLine(championWorlds, line);

// ── PROVENANCE ────────────────────────────────────────────────────────────────────────────────────
const batterRow = (b) => ({ playerId: b.playerId, name: b.name, expHits: b.expHits, expTotalBases: b.expTotalBases, padded: b.expHits == null });
const confirmed = confirmedByGamePk.get(gamePk) ?? { away: null, home: null };
const engineFiles = ["app/src/lib/mlb/full-game/engine.ts", "app/src/lib/mlb/full-game/plate-appearance.ts", "app/src/lib/mlb/full-game/engine-candidates.ts", "app/src/lib/mlb/full-game/board-adapter.ts", "app/src/lib/mlb/full-game/world-summary.ts", "app/scripts/research/freeze-mlb-slate-game.mjs"];
const featureCapture = (family) => {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/mlb/pregame-archive/pregame-features", family, date, `${gamePk}.json`), "utf8"));
    return { capturedAt: d.capturedAt ?? null, usedByModel: false };
  } catch {
    return null;
  }
};

const receipt = {
  schemaVersion: 1,
  artifact: "mlb-playoff-slate-frozen-forecast",
  dataClass: "PRIVATE_RESEARCH",
  maturity: "EXPERIMENTAL",
  productEligible: false,
  productEligibilityNote: "MLB totals stay PAUSED for picks, Top Boards, Parlays, Bank Builder and Moonshot. This receipt grants no eligibility.",
  date,
  gamePk,
  slug: input.slug,
  matchup: `${input.awayTeamName} @ ${input.homeTeamName}`,
  venue: input.venue,
  firstPitch,
  frozenAt: nowIso,
  minutesBeforeFirstPitch: Math.round((Date.parse(firstPitch) - Date.parse(nowIso)) / 60000),
  model: {
    id: SLATE_MODEL_ID,
    engine: "E3 full-game plate-appearance engine (PA → base/out → inning → game), unchanged code",
    parameterSet: ENGINE_LEVEL_CANDIDATE_V1.id,
    parameterProtocol: ENGINE_LEVEL_CANDIDATE_V1.protocol,
    parameterOverride: ENGINE_LEVEL_CANDIDATE_V1.override,
    parameterHash: stableHash(slateParams),
    status: "P317 registered forward candidate (not the public champion; adoption is a founder decision)",
    gitHead: git("rev-parse HEAD"),
    fileSha256: Object.fromEntries(engineFiles.map((f) => [f, sha256File(f)])),
  },
  simulation: { worlds: n, seed, rng: "sfc32 seeded by cyrb128(seed)", extrasShare: Math.round(extras * 1e4) / 1e4, msElapsed: Date.now() - t0 },
  inputs: {
    board: { generatedAt: board.generatedAt, sha256OfCommittedJson: stableHash(board) },
    lineups: {
      away: { source: input.completeness.awayLineupSource, capturedAt: confirmed.away?.capturedAt ?? null, batters: input.awayLineup.map(batterRow) },
      home: { source: input.completeness.homeLineupSource, capturedAt: confirmed.home?.capturedAt ?? null, batters: input.homeLineup.map(batterRow) },
      archiveSnapshotsVisibleAtFreeze: lineupFilesSeen,
    },
    starters: {
      away: input.awayStarter ? { ...input.awayStarter } : null,
      home: input.homeStarter ? { ...input.homeStarter } : null,
    },
    market: input.market ?? null,
    completeness: input.completeness,
    capturedButNotUsed: {
      parkFactors: featureCapture("park-factors"),
      bullpen: featureCapture("bullpen"),
      pitcherWorkload: featureCapture("pitcher-workload"),
      batterSplits: featureCapture("batter-splits"),
      travelRest: featureCapture("travel-rest"),
      reason: "No forward evidence yet that adding these to the engine improves its forecasts; adding them on game day would be an untested model.",
    },
  },
  result: {
    reconciliation: { ...rec, identities },
    winner: { home: homeWin, away: Math.round((1 - homeWin) * 1e4) / 1e4 },
    runs: {
      away: { mean: Math.round(mean(awayRuns) * 1e3) / 1e3, ...quantiles(awayRuns) },
      home: { mean: Math.round(mean(homeRuns) * 1e3) / 1e3, ...quantiles(homeRuns) },
    },
    total: {
      mean: Math.round(mean(totals) * 1e3) / 1e3,
      ...quantiles(totals),
      atMarketLine: tl,
      ladder,
      histogram: totalHistogram(worlds),
    },
    margin: { mean: Math.round(mean(margins) * 1e3) / 1e3, ...quantiles(margins) },
    runLine: [runLineAt(worlds, 1.5), runLineAt(worlds, 2.5)],
    topFinalScores: topScores,
  },
  convergence,
  comparison: {
    publicChampion: {
      modelVersion: CHAMPION_VERSION,
      winner: champion.winProbability,
      totalMean: champion.totalRuns.mean,
      totalMedian: champion.totalRuns.median,
      atMarketLine: championTl,
      runLine15: champion.runLine.find((r) => r.line === 1.5),
      note: "Same inputs and seed, default parameters. Its known forward level error is about +0.62 runs per game too low (P317 receipt).",
    },
    market: input.market ?? null,
    marketNote: "De-vigged sportsbook prices are a comparison only. They never move a world.",
  },
  worlds: { encoding: "away,home per world, in simulation order", data: worlds.map((w) => `${w.away},${w.home}`).join(";") },
};
receipt.receiptHash = stableHash({ ...receipt, receiptHash: undefined });

// ── REPORT ────────────────────────────────────────────────────────────────────────────────────────
const pct = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
console.log(`\n=== ${receipt.matchup} · first pitch ${firstPitch} · frozen ${nowIso} (${receipt.minutesBeforeFirstPitch} min before) ===`);
console.log(`model ${SLATE_MODEL_ID} · ${n} worlds · seed "${seed}"`);
console.log(`lineups: away ${input.completeness.awayLineupSource} (${confirmed.away?.capturedAt ?? "-"}) · home ${input.completeness.homeLineupSource} (${confirmed.home?.capturedAt ?? "-"})`);
console.log(`starters: ${input.awayStarter?.name ?? "none"} (K proj ${input.awayStarter?.expStrikeouts ?? "-"}) vs ${input.homeStarter?.name ?? "none"} (K proj ${input.homeStarter?.expStrikeouts ?? "-"})`);
console.log(`winner: ${input.homeTeam} ${pct(homeWin)} / ${input.awayTeam} ${pct(1 - homeWin)}`);
console.log(`runs: ${input.awayTeam} mean ${receipt.result.runs.away.mean} med ${receipt.result.runs.away.p50} · ${input.homeTeam} mean ${receipt.result.runs.home.mean} med ${receipt.result.runs.home.p50}`);
console.log(`total: mean ${receipt.result.total.mean} · median ${receipt.result.total.p50} · p10–p90 ${receipt.result.total.p10}–${receipt.result.total.p90}`);
if (tl) console.log(`line ${line} (${input.market.bookmaker} ${input.market.capturedAt}): over ${pct(tl.over)} · under ${pct(tl.under)} · push ${pct(tl.push)} · market over ${pct(input.market.total.over)}`);
console.log(`run line: ${input.homeTeam} -1.5 ${pct(rl.homeCover)} · ${input.awayTeam} -1.5 ${pct(rl.awayCover)}`);
console.log(`champion (comparison): ${input.homeTeam} ${pct(champion.winProbability.home)} · total mean ${champion.totalRuns.mean} · over ${pct(championTl?.over)} push ${pct(championTl?.push)}`);
console.log(`reconciliation ok=${rec.ok} identities=${JSON.stringify(identities)}`);
console.log(`convergence: ${convergence.verdict}`);
for (const c of checkpoints) console.log(`  ${String(c.worlds).padStart(5)}: home ${pct(c.homeWin)} over ${pct(c.over)} push ${pct(c.push)} meanTotal ${c.meanTotal} homeCover ${pct(c.homeCover)}`);

const allIdentities = Object.values(identities).every((v) => v === true || v === null);
if (!rec.ok || !allIdentities) {
  console.error("[slate-freeze] reconciliation FAILED — nothing frozen.");
  process.exit(4);
}

if (write) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(receiptPath, JSON.stringify(receipt) + "\n", { flag: "wx" });
  console.log(`\n✓ froze ${path.relative(REPO, receiptPath)} · receiptHash ${receipt.receiptHash}`);
  if (mirrorDir) {
    fs.mkdirSync(mirrorDir, { recursive: true });
    const m = path.join(mirrorDir, `${gamePk}-${input.slug}.json`);
    if (!fs.existsSync(m)) fs.writeFileSync(m, JSON.stringify(receipt) + "\n", { flag: "wx" });
    console.log(`✓ mirrored ${m}`);
  }
} else {
  console.log("\n(dry run — pass --write to freeze)");
}
