#!/usr/bin/env node
/**
 * Generate internal MLB full-game sim artifacts for settled dates that have closing odds + linescores but no
 * team-markets snapshot (07-04..07-08). Uses the EXISTING market-anchored engine (`buildFullGameSimArtifact` +
 * DEFAULT_SIM_OPTIONS) exactly as-is — the only difference is the market anchor is sourced from the historical
 * CLOSING odds (data/internal/mlb/reference/mlb-closing-odds.json) instead of the live team-markets Game Center,
 * because that's the de-vigged market we have for those dates. Nothing new is modeled.
 *
 * Writes (INTERNAL, public:false): data/internal/mlb/full-game-sim/<date>.json  (same shape as 07-09).
 * Usage: node app/scripts/build-mlb-full-game-sim-from-closing.mjs --dates 2026-07-04,2026-07-05,... [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFullGameSimArtifact, DEFAULT_SIM_OPTIONS } from "../src/lib/full-game-sim/mlb/index.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(REPO, "data/internal/mlb/full-game-sim");
const WRITE = process.argv.includes("--write");
const datesArg = (() => { const i = process.argv.indexOf("--dates"); return i >= 0 ? process.argv[i + 1] : null; })();
const only = datesArg ? new Set(datesArg.split(",").map((s) => s.trim())) : null;

const abbr = (name) => String(name).split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();
const closing = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/mlb/reference/mlb-closing-odds.json"), "utf8")).games;

const byDate = new Map();
for (const g of closing) { if (only && !only.has(g.date)) continue; (byDate.get(g.date) ?? byDate.set(g.date, []).get(g.date)).push(g); }

for (const [date, games] of [...byDate].sort()) {
  const artifacts = [];
  for (const g of games) {
    const c = g.closing;
    if (c.homeWinProb == null) continue;
    const art = buildFullGameSimArtifact(
      {
        gameId: String(g.gamePk), gamePk: g.gamePk, date,
        teams: { away: { name: g.away, abbreviation: abbr(g.away) }, home: { name: g.home, abbreviation: abbr(g.home) } },
        market: {
          total: c.totalLine ?? undefined,
          homeWinProb: c.homeWinProb,
          awayWinProb: c.awayWinProb ?? (c.homeWinProb != null ? +(1 - c.homeWinProb).toFixed(4) : undefined),
          runLine: { line: 1.5, favorite: c.homeWinProb >= 0.5 ? "home" : "away" },
        },
      },
      DEFAULT_SIM_OPTIONS,
    );
    artifacts.push(art);
  }
  const partial = artifacts.filter((a) => a.dataQuality.status === "partial").length;
  const blocked = artifacts.filter((a) => a.dataQuality.status === "blocked").length;
  const out = {
    sport: "MLB", date, asOf: date, public: false, internal: true,
    kind: "full-game-sim-experimental", source: "market_anchored_simulation", status: "experimental_internal",
    runCount: DEFAULT_SIM_OPTIONS.runCount, modelVersion: DEFAULT_SIM_OPTIONS.modelVersion, seed: DEFAULT_SIM_OPTIONS.seed, vmr: DEFAULT_SIM_OPTIONS.vmr,
    officialMoneyRecordAffected: false, activeProductCard: false, modelMode: "market_anchored_simulation",
    marketAnchorSource: "historical_closing_odds", // NOTE: anchored to The Odds API closing odds (not live team-markets)
    rollout: { publicRolloutVerdict: "blocked", productCardEligible: false, backtestEligible: true, reason: "MARKET-ANCHORED; win prob + total match the closing market by construction. Does not beat the market. For the expanded backtest only." },
    summary: { games: artifacts.length, partial, blocked },
    warning: "EXPERIMENTAL INTERNAL market-anchored simulation, anchored to HISTORICAL CLOSING odds for a settled-window backtest. NOT web-served, NOT a public claim. Separate from the official 19-14 record.",
    games: artifacts,
  };
  if (WRITE) { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(path.join(OUT_DIR, `${date}.json`), JSON.stringify(out, null, 2) + "\n"); }
  console.log(`[fgs-closing] ${WRITE ? "WROTE" : "DRY"} ${date} · ${artifacts.length} games (partial ${partial}, blocked ${blocked})`);
}
if (!WRITE) console.log("  (dry run — pass --write to persist to data/internal)");
