/**
 * build-full-game-sim-readiness.mjs — an INTERNAL, honest "how close are we to a full-game simulation"
 * readiness artifact per MLB game. READ-ONLY re: money; deterministic.
 *
 * GameTime does NOT have a full-game score simulation. The most this repo can honestly produce today is
 * a MARKET-IMPLIED read from the de-vigged team-market Game Center: win probability + run-line / total
 * coverage + the market's expected total. The projected away/home score, run/margin/score distributions
 * — the things that make a real full-game sim — are BLOCKED (no committed team-scoring model). This
 * artifact records exactly that, per game, and is validated against the full-game-sim schema so it can
 * never mislabel market-implied data as a simulation.
 *
 * Output (repo-root data/internal — NOT web-served): data/internal/mlb/full-game-sim-readiness/<date>.json
 * Deterministic (asOf = the date, no wall-clock). Usage:
 *   npx tsx scripts/build-full-game-sim-readiness.mjs [--date 2026-07-09] [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { getMlbGameCenter } from "../src/lib/mlb-team-markets.ts";
import { validateFullGameSimArtifact } from "../src/lib/full-game-sim/schema.ts";

const APP = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const REPO = path.join(APP, "..");
const BOARDS = path.join(APP, "public", "data", "mlb", "boards");
const OUT_DIR = path.join(REPO, "data", "internal", "mlb", "full-game-sim-readiness");
const WRITE = process.argv.includes("--write");
const DATE = (() => { const i = process.argv.indexOf("--date"); return i >= 0 ? process.argv[i + 1] : null; })();
const SCHEMA_VERSION = "1.0.0";

function latestBoardDate() {
  const files = fs.readdirSync(BOARDS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  return files.length ? files[files.length - 1].replace(".json", "") : null;
}
const num = (x) => (typeof x === "number" && Number.isFinite(x) ? Number(x.toFixed(4)) : undefined);

/** gamePk-keyed game info (gameId + abbrs) from the board leans. */
function gameInfo(date) {
  const p = path.join(BOARDS, `${date}.json`);
  const map = new Map();
  if (!fs.existsSync(p)) return map;
  for (const l of (JSON.parse(fs.readFileSync(p, "utf8")).leans || [])) {
    if (l.gameId && !map.has(l.gameId)) map.set(l.gameId, { gamePk: l.gamePk, homeAbbr: l.homeTeamAbbr ?? "", awayAbbr: l.awayTeamAbbr ?? "", homeName: l.homeTeamName ?? l.homeTeamAbbr ?? "", awayName: l.awayTeamName ?? l.awayTeamAbbr ?? "" });
  }
  return map;
}

/** The honest, market-implied readiness artifact for one game (never labels market data a simulation). */
function buildArtifact(date, gameId, info) {
  const gc = getMlbGameCenter(date, gameId);
  const hasMarket = !!(gc && (gc.moneyline || gc.total || gc.runLine));
  const art = {
    schemaVersion: SCHEMA_VERSION, sport: "MLB", gameId, gamePk: info.gamePk, date, asOf: date, public: false,
    source: { marketSnapshot: true, teamMarketLines: hasMarket, playerPropSimulation: true, linescoreSettlement: false, modelInputs: ["de-vigged team-market lines (moneyline / total / run line)"] },
    teams: { away: { name: gc?.awayTeam || info.awayName, abbreviation: info.awayAbbr }, home: { name: gc?.homeTeam || info.homeName, abbreviation: info.homeAbbr } },
    // NO runCount — this is not a sampled simulation. NO projectedScore away/home/margin (needs a
    // scoring model). NO distributions (blocked). Only what the market honestly implies:
    ...(gc?.total ? { projectedScore: { totalMean: num(gc.total.line), source: "market_implied" } } : {}),
    ...(gc?.moneyline ? { winProbability: { away: num(gc.moneyline.awayWinProb), home: num(gc.moneyline.homeWinProb), source: "market_implied" } } : {}),
    marketCoverage: {
      ...(gc?.moneyline ? { moneyline: { homeWinProb: num(gc.moneyline.homeWinProb), awayWinProb: num(gc.moneyline.awayWinProb), source: "market_implied" } } : {}),
      ...(gc?.runLine ? { runLine: { line: gc.runLine.line, favorite: gc.runLine.favorite, coverProbability: num(gc.runLine.favoriteCoverProb), source: "market_implied" } } : {}),
      ...(gc?.total ? { total: { line: gc.total.line, overProbability: num(gc.total.overProb), underProbability: num(gc.total.underProb), source: "market_implied" } } : {}),
    },
    dataQuality: {
      status: hasMarket ? "partial" : "blocked",
      reasons: hasMarket
        ? ["market-implied win probability + run-line/total coverage available from de-vigged team lines", "a 10,000-run PLAYER-PROP simulation exists separately — this is NOT a full-game score simulation"]
        : ["no committed team markets for this game"],
      missing: ["projected away/home score + margin (needs a team-scoring model)", "total-runs distribution", "margin distribution", "run / score-pair distributions", "SIMULATED win probability (only market-implied today)"],
    },
    guardrails: { publicFormulaChanged: false, officialMoneyRecordAffected: false, activeProductCard: false },
  };
  return art;
}

function main() {
  const date = DATE ?? latestBoardDate();
  if (!date) { console.error("[fgs-readiness] no date"); process.exit(1); }
  const games = gameInfo(date);
  const artifacts = [];
  const invalid = [];
  for (const [gameId, info] of games) {
    const art = buildArtifact(date, gameId, info);
    const v = validateFullGameSimArtifact(art);
    if (!v.valid) { invalid.push({ gameId, errors: v.errors }); continue; } // never emit a schema-invalid artifact
    artifacts.push(art);
  }
  const summary = { ready: 0, partial: artifacts.filter((a) => a.dataQuality.status === "partial").length, blocked: artifacts.filter((a) => a.dataQuality.status === "blocked").length };

  const out = {
    sport: "MLB", date, asOf: date, public: false, internal: true,
    kind: "full-game-sim-readiness",
    officialMoneyRecordAffected: false, activeProductCard: false,
    verdict: "NO full-game score simulation exists. Every game is at best PARTIAL (market-implied win prob + run-line/total coverage); projected score + all distributions are BLOCKED pending a dedicated team-scoring model / alternate-line ladder ingest.",
    gameCount: artifacts.length, readinessSummary: summary, invalidCount: invalid.length,
    games: artifacts,
    note: "INTERNAL readiness audit — NOT web-served, NOT a public simulation. Market-implied only; nothing here is labelled a simulation. Separate from the official 19-14 record.",
  };

  if (WRITE) { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(path.join(OUT_DIR, `${date}.json`), JSON.stringify(out, null, 2) + "\n"); }
  console.log(`[fgs-readiness] ${WRITE ? "WROTE" : "DRY-RUN"} ${date} · ${artifacts.length} games · ${JSON.stringify(summary)}${invalid.length ? ` · ${invalid.length} INVALID (skipped)` : ""}`);
  if (invalid.length) for (const iv of invalid.slice(0, 3)) console.log("  ⚠ invalid:", iv.gameId, iv.errors.join("; "));
  if (!WRITE) console.log("  (dry run — pass --write to persist)");
}

main();
