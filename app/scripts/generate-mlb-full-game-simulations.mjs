/**
 * generate-mlb-full-game-simulations.mjs — the daily FULL-GAME simulation generator (Sprint 008).
 *
 *   npx tsx app/scripts/generate-mlb-full-game-simulations.mjs --date 2026-07-24 [--write] [--now ISO]
 *
 * Reads the public pregame board (`boards/<date>.json`) — leakage-safe, generated before first pitch — runs
 * the PA→base/out→inning full-game engine 10,000 COMPLETE games per matchup, and writes one artifact keyed
 * by gamePk to `public/data/mlb/full-game-simulations/<date>.json`. The de-vigged team markets are carried
 * as a COMPARISON layer only; they are NEVER an input to the simulation.
 *
 * Default is a DRY RUN (prints the reconciliation matrix). Pass --write to persist. A reproducibility self-
 * check rebuilds with a different `generatedAt` and asserts every per-game artifactHash is identical.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gameInputsFromBoard } from "../src/lib/mlb/full-game/board-adapter.ts";
import { selectConfirmedLineup } from "../src/lib/mlb/full-game/confirmed-lineup.ts";
import { simulateFullGame } from "../src/lib/mlb/full-game/simulate.ts";
import { stableHash } from "../src/lib/game-simulations/rng.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(APP, "public", "data");
const MODEL_VERSION = "mlb-fullgame-2026.08-pa-v2";
const SIMULATION_VERSION = 1;
const RUN_COUNT = 10000;

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
};
const date = arg("--date") ?? new Date().toISOString().slice(0, 10);
const write = process.argv.includes("--write");
const nowIso = arg("--now") ?? new Date().toISOString();

const readJson = (rel) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8"));
  } catch {
    return null;
  }
};

const board = readJson(`mlb/boards/${date}.json`);
if (!board || !Array.isArray(board.games)) {
  console.log(`[full-game-sim] no board for ${date} — nothing to build (honest no-op).`);
  process.exit(0);
}

/*
 * ── THE PRE-EVENT BOUNDARY HOLDS AGAINST THIS RUN'S OWN CLOCK (P246 MLB input audit) ──────────
 *
 * `startedBeforeGeneration` was stamped against the BOARD's generatedAt. The board said
 * "pregame" at 18:23Z; the lineup-refresh rerun at 01:21Z then republished fresh 10k "pregame"
 * forecasts for games hours under way (2026-09-07: min-vs-det simulated ~6h after first pitch).
 * The flag is re-derived here ONCE from each game's own firstPitch vs nowIso, on a copy used
 * for INPUTS — before both build() calls, so the reproducibility probe (which replays with a
 * fake clock) still sees identical inputs. `sourceBoardHash` keeps hashing the board as
 * committed. A game that already has a published pregame simulation is CARRIED FORWARD
 * verbatim below, never regenerated and never destroyed.
 */
const startedByNow = new Set(
  board.games
    .filter((g) => g.gameDate && Number.isFinite(Date.parse(g.gameDate)) && Date.parse(g.gameDate) <= Date.parse(nowIso))
    .map((g) => g.gamePk),
);
const boundedBoard = {
  ...board,
  games: board.games.map((g) => (startedByNow.has(g.gamePk) ? { ...g, startedBeforeGeneration: true } : g)),
};
const priorArtifact = readJson(`mlb/full-game-simulations/${date}.json`);

// Market comparison map (display-only): gamePk → de-vigged team markets, joined via the board's odds gameId.
const teamMarkets = readJson(`mlb/team-markets/${date}.json`);

/*
 * ── THE CONFIRMED BATTING ORDER ────────────────────────────────────────────────────────────────
 *
 * capture-mlb-pregame-lineup.mjs has been writing immutable, timestamped nine-man orders from the
 * free StatsAPI eight times a day, and this simulation never read them. It built each side from the
 * board's PROP LINES instead — a batter existed only if a book had posted a line for him — so every
 * game on 2026-08-21 came out `degraded` with fourteen of fifteen padded, while the confirmed order
 * for all fifteen sat on disk.
 *
 * It matters because this engine simulates plate appearances: leadoff takes about 4.6 to the ninth
 * hitter's 3.9, so who bats where changes what each bat is worth over ten thousand games.
 *
 * A missing archive is a normal state, not a failure — the simulation falls back to exactly what it
 * did before and says so per game.
 */
const lineupDir = path.join(APP, "..", "data/internal/mlb/pregame-archive/pregame-features/lineup", date);
const confirmedByGamePk = new Map();
try {
  const byGame = new Map();
  for (const file of fs.readdirSync(lineupDir).filter((f) => f.endsWith(".json"))) {
    try {
      const snap = JSON.parse(fs.readFileSync(path.join(lineupDir, file), "utf8"));
      if (!Number.isFinite(snap?.gamePk)) continue;
      if (!byGame.has(snap.gamePk)) byGame.set(snap.gamePk, []);
      byGame.get(snap.gamePk).push(snap);
    } catch { /* a torn snapshot is not a lineup */ }
  }
  for (const [gamePk, snaps] of byGame) {
    const picked = selectConfirmedLineup(snaps);
    if (picked.away || picked.home) confirmedByGamePk.set(gamePk, picked);
  }
} catch { /* no archive for this date — every side falls back to prop-derived */ }
const confirmedSides = [...confirmedByGamePk.values()].reduce((n, c) => n + (c.away ? 1 : 0) + (c.home ? 1 : 0), 0);
console.log(`[full-game-sim] confirmed batting orders: ${confirmedSides} side(s) across ${confirmedByGamePk.size} game(s)`);
const marketByGamePk = new Map();
if (teamMarkets && teamMarkets.games && typeof teamMarkets.games === "object") {
  const oddsIdByGamePk = new Map();
  for (const l of board.leans) if (l.gamePk != null && l.gameId) oddsIdByGamePk.set(l.gamePk, l.gameId);
  // team-markets `games` is a Record keyed by the odds gameId (not an array).
  const byOddsId = new Map(Object.entries(teamMarkets.games));
  for (const g of board.games) {
    const oddsId = oddsIdByGamePk.get(g.gamePk);
    const tm = oddsId ? byOddsId.get(oddsId) : null;
    if (!tm) continue;
    marketByGamePk.set(g.gamePk, {
      bookmaker: tm.bookmaker ?? null,
      capturedAt: teamMarkets.generatedAt ?? null,
      moneyline: tm.moneyline ? { home: tm.moneyline.home?.noVigProb ?? null, away: tm.moneyline.away?.noVigProb ?? null } : null,
      total: tm.total ? { line: tm.total.line ?? null, over: tm.total.over?.noVigProb ?? null } : null,
      runLine: tm.runLine ? { line: tm.runLine.line ?? null, homeCover: tm.runLine.home?.coverNoVigProb ?? null } : null,
    });
  }
}

const opts = { runCount: RUN_COUNT, modelVersion: MODEL_VERSION, simulationVersion: SIMULATION_VERSION, generatedAt: nowIso };

function build(generatedAt) {
  const inputs = gameInputsFromBoard(boundedBoard, marketByGamePk, confirmedByGamePk);
  const games = inputs.map((input) => simulateFullGame(input, { ...opts, generatedAt }));
  return {
    sport: "mlb",
    date,
    generatedAt,
    modelVersion: MODEL_VERSION,
    simulationVersion: SIMULATION_VERSION,
    runCount: RUN_COUNT,
    sourceBoardHash: stableHash(board),
    games,
  };
}

const artifact = build(nowIso);

// Reproducibility self-check: a different clock must NOT change any per-game hash.
const replay = build("2099-12-31T23:59:59Z");
const mismatch = artifact.games.find((g, i) => g.artifactHash !== replay.games[i].artifactHash);
if (mismatch) {
  console.error(`[full-game-sim] NON-REPRODUCIBLE: ${mismatch.slug} hash changed with the clock — aborting.`);
  process.exit(1);
}

/*
 * CARRY-FORWARD: a game that started since the last run keeps its LAST PREGAME simulation,
 * byte-for-byte. Frozen means frozen — the alternative was this rerun replacing a legitimate
 * morning forecast with an "unavailable" refusal (destroying the record) or, before this fix,
 * with a fresh simulation stamped pregame after first pitch (backfilling). Runs after the
 * probe, deterministically: the started set and the prior bytes are both fixed inputs.
 */
let carriedForward = 0;
if (priorArtifact?.games?.length) {
  const priorByPk = new Map(priorArtifact.games.map((g) => [g.gamePk, g]));
  artifact.games = artifact.games.map((g) => {
    if (!startedByNow.has(g.gamePk)) return g;
    const prior = priorByPk.get(g.gamePk);
    // Carry ONLY a genuinely pregame prior: the prior FILE must predate this game's first
    // pitch. The 2026-09-07 01:21Z artifact held three post-start simulations (the very bug
    // this boundary fixes) — those may not be preserved as pregame either; the game refuses.
    const priorIsPregame = prior
      && prior.completeness?.level !== "unavailable"
      && priorArtifact.generatedAt
      && g.firstPitch
      && Date.parse(priorArtifact.generatedAt) <= Date.parse(g.firstPitch);
    if (priorIsPregame) {
      carriedForward += 1;
      return prior;
    }
    return g;
  });
}
if (carriedForward) console.log(`[full-game-sim] ${carriedForward} started game(s) kept their frozen pregame simulation (never regenerated, never destroyed).`);

// Reconciliation matrix.
console.log(`\n=== FULL-GAME SIM ${date} · ${MODEL_VERSION} · ${RUN_COUNT} complete games/matchup ===`);
console.log("game                         gamePk   status      win%(A/H)     score(med)  total(med,p10-p90)  RL(H-1.5)");
for (const g of artifact.games) {
  if (g.status === "unavailable") {
    console.log(`${g.slug.padEnd(28)} ${String(g.gamePk).padStart(7)}  UNAVAILABLE  ${g.completeness.notes.join(" ").slice(0, 40)}`);
    continue;
  }
  const wa = Math.round(g.winProbability.away * 100);
  const wh = Math.round(g.winProbability.home * 100);
  const rl = g.runLine.find((r) => r.line === 1.5);
  console.log(
    `${g.slug.padEnd(28)} ${String(g.gamePk).padStart(7)}  ${g.status.toUpperCase().padEnd(9)} ` +
      `${String(wa).padStart(3)}/${String(wh).padStart(3)}%     ` +
      `${g.awayTeam} ${g.runs.away.median}-${g.runs.home.median} ${g.homeTeam}   ` +
      `${g.totalRuns.median} (${g.totalRuns.p10}-${g.totalRuns.p90})        ${Math.round(rl.homeCover * 100)}%`,
  );
}
const ready = artifact.games.filter((g) => g.status === "ready").length;
const degraded = artifact.games.filter((g) => g.status === "degraded").length;
const unavailable = artifact.games.filter((g) => g.status === "unavailable").length;
console.log(`\nreconciliation: ${artifact.games.length} games · ${ready} READY · ${degraded} DEGRADED · ${unavailable} UNAVAILABLE`);

if (write) {
  const outDir = path.join(DATA, "mlb", "full-game-simulations");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${date}.json`), JSON.stringify(artifact, null, 2));
  console.log(`\n✓ wrote public/data/mlb/full-game-simulations/${date}.json`);
} else {
  console.log(`\n(dry run — pass --write to persist)`);
}
