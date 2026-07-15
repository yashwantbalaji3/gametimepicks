#!/usr/bin/env node
/**
 * Feature #1 experiment: generate internal MLB full-game sim artifacts for 07-04..07-09 WITH the bounded
 * probable-starter strength adjustment. Same engine + market anchor (closing odds) as the market-anchored
 * baseline; the ONLY difference is `independent: { starter runs-saved/9 }` fed from the strictly-earlier
 * pitcher-strength ratings, so the engine applies its bounded shadow nudge.
 *
 * Reads: mlb-closing-odds.json (market anchor) + mlb-bullpen-usage-2026-07-04-2026-07-09.json (leakage-safe ratings).
 * Writes (INTERNAL, public:false, SEPARATE dir so the baseline artifacts are kept):
 *   data/internal/mlb/full-game-sim-bullpen-v1/<date>.json
 * Usage: node app/scripts/build-mlb-full-game-sim-bullpen-v1.mjs [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFullGameSimArtifact, DEFAULT_SIM_OPTIONS } from "../src/lib/full-game-sim/mlb/index.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(REPO, "data/internal/mlb/full-game-sim-bullpen-v1");
const WRITE = process.argv.includes("--write");
const abbr = (name) => String(name).split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();

const closing = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/mlb/reference/mlb-closing-odds.json"), "utf8")).games;
const pitcher = new Map(JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/mlb/reference/mlb-bullpen-usage-2026-07-04-2026-07-09.json"), "utf8")).games.map((g) => [g.gamePk, g]));

const byDate = new Map();
for (const g of closing) (byDate.get(g.date) ?? byDate.set(g.date, []).get(g.date)).push(g);

let withPitcher = 0, total = 0;
for (const [date, games] of [...byDate].sort()) {
  const artifacts = [];
  for (const g of games) {
    const c = g.closing;
    if (c.homeWinProb == null) continue;
    total++;
    const bp = pitcher.get(g.gamePk); // map holds bullpen-usage rows
    const independent = bp && bp.homeBullpen?.fatigueIndex != null && bp.awayBullpen?.fatigueIndex != null ? {
      bullpenFatigue: {
        homeFatigueIndex: bp.homeBullpen.fatigueIndex, awayFatigueIndex: bp.awayBullpen.fatigueIndex,
        homeCoverage: bp.homeBullpen.coverage, awayCoverage: bp.awayBullpen.coverage,
      },
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
    kind: "full-game-sim-bullpen-fatigue-experiment",
    source: "market_anchored_simulation", status: "experimental_internal",
    runCount: DEFAULT_SIM_OPTIONS.runCount, modelVersion: DEFAULT_SIM_OPTIONS.modelVersion, seed: DEFAULT_SIM_OPTIONS.seed, vmr: DEFAULT_SIM_OPTIONS.vmr,
    officialMoneyRecordAffected: false, activeProductCard: false,
    modelMode: "internal_mlb_bullpen_fatigue_v1",
    marketAnchorSource: "historical_closing_odds",
    notForProducts: true,
    featureSet: ["bullpen_fatigue_v1"],
    featureNote: "Bounded shadow adjustment (±0.35 total / ±0.20 margin runs) from strictly-earlier day-weighted relief innings. Market anchor unchanged; bullpen fatigue only nudges the run means.",
    rollout: { publicRolloutVerdict: "blocked", productCardEligible: false, backtestEligible: true, reason: "Feature #2 experiment. Internal-only; adopt only if it beats the closing market on Brier + log loss." },
    summary: { games: artifacts.length, withBullpenAdjustment: artifacts.filter((a) => (a.model?.adjustments?.bullpenTotalNudge ?? 0) !== 0 || (a.model?.adjustments?.bullpenMarginNudge ?? 0) !== 0).length },
    games: artifacts,
  };
  if (WRITE) { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(path.join(OUT_DIR, `${date}.json`), JSON.stringify(out, null, 2) + "\n"); }
  console.log(`[fgs-bullpen] ${WRITE ? "WROTE" : "DRY"} ${date} · ${artifacts.length} games · ${out.summary.withBullpenAdjustment} with bullpen adjustment`);
}
console.log(`  ${withPitcher}/${total} games got a bullpen adjustment${WRITE ? "" : " (dry run — pass --write)"}`);
