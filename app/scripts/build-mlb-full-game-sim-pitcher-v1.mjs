#!/usr/bin/env node
/**
 * Feature #1 experiment: generate internal MLB full-game sim artifacts for 07-04..07-09 WITH the bounded
 * probable-starter strength adjustment. Same engine + market anchor (closing odds) as the market-anchored
 * baseline; the ONLY difference is `independent: { starter runs-saved/9 }` fed from the strictly-earlier
 * pitcher-strength ratings, so the engine applies its bounded shadow nudge.
 *
 * Reads: mlb-closing-odds.json (market anchor) + mlb-pitcher-strength.json (leakage-safe ratings).
 * Writes (INTERNAL, public:false, SEPARATE dir so the baseline artifacts are kept):
 *   data/internal/mlb/full-game-sim-pitcher-v1/<date>.json
 * Usage: node app/scripts/build-mlb-full-game-sim-pitcher-v1.mjs [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFullGameSimArtifact, DEFAULT_SIM_OPTIONS } from "../src/lib/full-game-sim/mlb/index.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(REPO, "data/internal/mlb/full-game-sim-pitcher-v1");
const WRITE = process.argv.includes("--write");
const abbr = (name) => String(name).split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();

const closing = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/mlb/reference/mlb-closing-odds.json"), "utf8")).games;
const pitcher = new Map(JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/mlb/reference/mlb-pitcher-strength.json"), "utf8")).games.map((g) => [g.gamePk, g]));

const byDate = new Map();
for (const g of closing) (byDate.get(g.date) ?? byDate.set(g.date, []).get(g.date)).push(g);

let withPitcher = 0, total = 0;
for (const [date, games] of [...byDate].sort()) {
  const artifacts = [];
  for (const g of games) {
    const c = g.closing;
    if (c.homeWinProb == null) continue;
    total++;
    const ps = pitcher.get(g.gamePk);
    const independent = ps?.home && ps?.away ? {
      homeStarterRunsSaved9: ps.home.runsSaved9, awayStarterRunsSaved9: ps.away.runsSaved9,
      starterSampleGames: { home: ps.home.starts, away: ps.away.starts },
    } : undefined;
    if (independent) withPitcher++;
    const art = buildFullGameSimArtifact(
      {
        gameId: String(g.gamePk), gamePk: g.gamePk, date,
        teams: { away: { name: g.away, abbreviation: abbr(g.away) }, home: { name: g.home, abbreviation: abbr(g.home) } },
        market: { total: c.totalLine ?? undefined, homeWinProb: c.homeWinProb, awayWinProb: c.awayWinProb ?? +(1 - c.homeWinProb).toFixed(4), runLine: { line: 1.5, favorite: c.homeWinProb >= 0.5 ? "home" : "away" } },
        independent,
      },
      DEFAULT_SIM_OPTIONS,
    );
    artifacts.push(art);
  }
  const out = {
    sport: "MLB", date, asOf: date, public: false, internal: true, internalOnly: true,
    kind: "full-game-sim-pitcher-strength-experiment",
    source: "market_anchored_simulation", status: "experimental_internal",
    runCount: DEFAULT_SIM_OPTIONS.runCount, modelVersion: DEFAULT_SIM_OPTIONS.modelVersion, seed: DEFAULT_SIM_OPTIONS.seed, vmr: DEFAULT_SIM_OPTIONS.vmr,
    officialMoneyRecordAffected: false, activeProductCard: false,
    modelMode: "internal_mlb_pitcher_strength_v1",
    marketAnchorSource: "historical_closing_odds",
    featureSet: ["probable_starter_fip_runs_saved_9_strictly_earlier"],
    featureNote: "Bounded shadow adjustment (±0.5 total / ±0.3 margin runs) from strictly-earlier starter FIP. Market anchor unchanged; pitcher only nudges the run means.",
    rollout: { publicRolloutVerdict: "blocked", productCardEligible: false, backtestEligible: true, reason: "Feature #1 experiment. Internal-only; adopt only if it beats the closing market on Brier + log loss." },
    summary: { games: artifacts.length, withPitcherAdjustment: artifacts.filter((a) => a.model?.inputCoverage?.pitcherStrength).length },
    games: artifacts,
  };
  if (WRITE) { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(path.join(OUT_DIR, `${date}.json`), JSON.stringify(out, null, 2) + "\n"); }
  console.log(`[fgs-pitcher] ${WRITE ? "WROTE" : "DRY"} ${date} · ${artifacts.length} games · ${out.summary.withPitcherAdjustment} with pitcher adjustment`);
}
console.log(`  ${withPitcher}/${total} games got a pitcher adjustment${WRITE ? "" : " (dry run — pass --write)"}`);
