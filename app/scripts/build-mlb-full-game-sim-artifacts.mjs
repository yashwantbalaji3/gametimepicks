/**
 * build-mlb-full-game-sim-artifacts.mjs — generate INTERNAL, experimental, MARKET-ANCHORED MLB
 * full-game simulation artifacts for a date. READ-ONLY re: money; deterministic (fixed seed).
 *
 * For each game with committed team markets it runs the pure Monte Carlo engine
 * (src/lib/full-game-sim/mlb) and emits a schema-valid FullGameSimulationArtifact (source
 * market_anchored_simulation, status experimental_internal). Games without a market total are emitted
 * BLOCKED (not fabricated). NOT web-served, NOT wired into the public UI, never touches money.
 *
 * Output: data/internal/mlb/full-game-sim/<date>.json   Usage:
 *   npx tsx scripts/build-mlb-full-game-sim-artifacts.mjs [--date 2026-07-09] [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { getMlbGameCenter } from "../src/lib/mlb-team-markets.ts";
import { buildFullGameSimArtifact, DEFAULT_SIM_OPTIONS } from "../src/lib/full-game-sim/mlb/index.ts";

const APP = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const REPO = path.join(APP, "..");
const BOARDS = path.join(APP, "public", "data", "mlb", "boards");
const OUT_DIR = path.join(REPO, "data", "internal", "mlb", "full-game-sim");
const WRITE = process.argv.includes("--write");
const DATE = (() => { const i = process.argv.indexOf("--date"); return i >= 0 ? process.argv[i + 1] : null; })();

function latestBoardDate() {
  const files = fs.readdirSync(BOARDS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  return files.length ? files[files.length - 1].replace(".json", "") : null;
}
function gameInfo(date) {
  const p = path.join(BOARDS, `${date}.json`);
  const map = new Map();
  if (!fs.existsSync(p)) return map;
  for (const l of (JSON.parse(fs.readFileSync(p, "utf8")).leans || [])) if (l.gameId && !map.has(l.gameId)) map.set(l.gameId, { gamePk: l.gamePk, homeAbbr: l.homeTeamAbbr ?? "", awayAbbr: l.awayTeamAbbr ?? "" });
  return map;
}
/** Market input for the engine, from the de-vigged Game Center (never fabricated). */
function marketFor(date, gameId) {
  const gc = getMlbGameCenter(date, gameId);
  return {
    total: gc?.total?.line,
    homeWinProb: gc?.moneyline?.homeWinProb,
    awayWinProb: gc?.moneyline?.awayWinProb,
    runLine: gc?.runLine ? { line: gc.runLine.line, favorite: gc.runLine.favorite } : undefined,
    _teams: gc ? { away: gc.awayTeam, home: gc.homeTeam } : null,
  };
}

function main() {
  const date = DATE ?? latestBoardDate();
  if (!date) { console.error("[fgs] no date"); process.exit(1); }
  const games = gameInfo(date);
  const artifacts = [];
  for (const [gameId, info] of games) {
    const mkt = marketFor(date, gameId);
    const art = buildFullGameSimArtifact(
      { gameId, gamePk: info.gamePk, date, teams: { away: { name: mkt._teams?.away || info.awayAbbr, abbreviation: info.awayAbbr }, home: { name: mkt._teams?.home || info.homeAbbr, abbreviation: info.homeAbbr } }, market: { total: mkt.total, homeWinProb: mkt.homeWinProb, awayWinProb: mkt.awayWinProb, runLine: mkt.runLine } },
      DEFAULT_SIM_OPTIONS,
    );
    artifacts.push(art);
  }
  const partial = artifacts.filter((a) => a.dataQuality.status === "partial").length;
  const blocked = artifacts.filter((a) => a.dataQuality.status === "blocked").length;

  const out = {
    sport: "MLB", date, asOf: date, public: false, internal: true,
    kind: "full-game-sim-experimental",
    source: "market_anchored_simulation", status: "experimental_internal",
    runCount: DEFAULT_SIM_OPTIONS.runCount, modelVersion: DEFAULT_SIM_OPTIONS.modelVersion, seed: DEFAULT_SIM_OPTIONS.seed, vmr: DEFAULT_SIM_OPTIONS.vmr,
    officialMoneyRecordAffected: false, activeProductCard: false,
    summary: { games: artifacts.length, partial, blocked },
    warning: "EXPERIMENTAL INTERNAL market-anchored simulation. Win prob + total match the market by construction; only the distributions are sampled. NOT web-served, NOT wired to the public page, NOT a public claim of a true full-game simulation. Separate from the official 19-14 record.",
    games: artifacts,
  };

  if (WRITE) { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(path.join(OUT_DIR, `${date}.json`), JSON.stringify(out, null, 2) + "\n"); }
  console.log(`[fgs] ${WRITE ? "WROTE" : "DRY-RUN"} ${date} · ${artifacts.length} games (partial ${partial}, blocked ${blocked}) · seed ${DEFAULT_SIM_OPTIONS.seed}`);
  if (!WRITE) console.log("  (dry run — pass --write to persist to data/internal)");
}

main();
