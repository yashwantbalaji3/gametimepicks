#!/usr/bin/env node
/**
 * Build the INTERNAL soccer projection artifact for a slate date, using the FIFA-Poisson engine.
 *
 * Reads (all committed, read-only):
 *   - app/public/data/world-cup/team-strength/team-strength-latest.json  (FIFA points, 110/110 coverage)
 *   - app/public/data/world-cup/projections/<date>.json | latest.json    (fixtures + market 1X2/total anchor)
 * Writes (INTERNAL ONLY — never web-served):
 *   - data/internal/world-cup/projection-engine/<date>.json
 *
 * Guarantees: public:false, touches no money artifact, imports the SAME pure engine the tests cover, and
 * writes NOTHING under app/public. modelMode is honest per the engine (rating-driven, market-anchored total).
 *
 * Usage: node app/scripts/build-internal-soccer-projections.mjs --date 2026-07-14 [--asOf <iso>]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { projectMatch } from "../src/lib/world-cup/internal-soccer-projection-engine.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const APP = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const date = getArg("--date");
const asOf = getArg("--asOf", `${date}T12:00:00Z`);
if (!date) { console.error("ERROR: --date YYYY-MM-DD required"); process.exit(1); }

const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();

// --- FIFA points ---
const tsRaw = JSON.parse(fs.readFileSync(path.join(APP, "public/data/world-cup/team-strength/team-strength-latest.json"), "utf8"));
const ratings = tsRaw.teams || tsRaw.ratings || Object.values(tsRaw).find(Array.isArray) || [];
const fifa = new Map(ratings.filter((t) => typeof t.fifaPoints === "number").map((t) => [norm(t.team), t.fifaPoints]));

// --- fixtures + market anchor from the projection slate ---
const projDir = path.join(APP, "public/data/world-cup/projections");
const projPath = fs.existsSync(path.join(projDir, `${date}.json`)) ? path.join(projDir, `${date}.json`) : path.join(projDir, "latest.json");
const proj = JSON.parse(fs.readFileSync(projPath, "utf8"));
const rows = proj.matches || [];

// Group market rows by matchId → the fixture + its market 1X2 + total line (for anchoring + comparison).
const fixtures = new Map();
for (const r of rows) {
  const id = String(r.matchId);
  if (!fixtures.has(id)) {
    fixtures.set(id, { matchId: id, home: r.homeTeam, away: r.awayTeam, kickoff: r.kickoffUtc, stage: r.stage, group: r.group, market: {}, totalLine: null });
  }
  const f = fixtures.get(id);
  const mkt = String(r.market || "").toLowerCase();
  // Match result (1X2) is the `moneyline_90` market; its 3-way de-vigged probs live in outcomes[].side.
  if (mkt === "moneyline_90" && Array.isArray(r.outcomes)) {
    for (const o of r.outcomes) {
      const mp = typeof o.marketProbability === "number" ? o.marketProbability : null;
      if (mp == null) continue;
      if (o.side === "home") f.market.homeWin = mp;
      else if (o.side === "draw") f.market.draw = mp;
      else if (o.side === "away") f.market.awayWin = mp;
    }
  }
  if (mkt === "match_total_goals" && r.line != null && f.totalLine == null) f.totalLine = Number(r.line);
}

const outMatches = [];
let missing = 0;
for (const f of fixtures.values()) {
  const hf = fifa.get(norm(f.home));
  const af = fifa.get(norm(f.away));
  if (hf == null || af == null) { missing++; continue; }
  // Internal projection: rating-driven; total anchored to the market line when present (honest volume anchor).
  const projected = projectMatch({ homeFifaPoints: hf, awayFifaPoints: af, marketTotalLine: f.totalLine });
  const market = (f.market.homeWin != null && f.market.draw != null && f.market.awayWin != null) ? f.market : null;
  outMatches.push({
    matchId: f.matchId,
    home: f.home,
    away: f.away,
    kickoff: f.kickoff,
    stage: f.stage,
    inputs: { homeFifaPoints: hf, awayFifaPoints: af, marketTotalLine: f.totalLine },
    projection: projected,
    marketComparison: market
      ? {
          source: "de_vigged_market_1x2",
          market,
          delta: {
            homeWin: projected.matchResult90.homeWin - market.homeWin,
            draw: projected.matchResult90.draw - market.draw,
            awayWin: projected.matchResult90.awayWin - market.awayWin,
          },
        }
      : { source: "unavailable", market: null, delta: null },
  });
}

const artifact = {
  version: "internal-soccer-projection-engine-v1",
  generatedAt: asOf,
  date,
  modelMode: "internal_soccer_projection_v1",
  public: false,
  internal: true,
  officialMoneyRecordAffected: false,
  webServed: false,
  competition: "WorldCup",
  strengthSource: "fifa_points",
  engine: "bivariate_poisson_fifa_supremacy",
  matchCount: outMatches.length,
  matches: outMatches,
  validation: {
    backtestStatus: "insufficient_sample",
    note: "Backtest on committed finished matches only (small N). A real validation needs a historical set (2022 WC via API-Football). See docs/SOCCER_PROJECTION_ENGINE_V1_BACKTEST.md.",
  },
  limitations: [
    "Rating-driven (FIFA points) bivariate Poisson — NOT an xG or event-data model.",
    "Total goals volume is anchored to the market line when available; supremacy is always rating-driven.",
    "Correct-score is a model distribution (independent Poisson, no Dixon-Coles low-score correction yet).",
    "NOT validated. Stays internal (public:false) until a real backtest passes and the founder approves.",
  ],
  disclaimer: "Internal prototype. Not web-served, not a public prediction, does not touch official money/record/exposure.",
};

const outDir = path.join(REPO, "data/internal/world-cup/projection-engine");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `${date}.json`);
fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));
console.log(`✓ wrote ${path.relative(REPO, outPath)} — ${outMatches.length} matches (${missing} skipped for missing FIFA), modelMode=${artifact.modelMode}, public=false`);
for (const m of outMatches) {
  const r = m.projection.matchResult90;
  const d = m.marketComparison.delta;
  console.log(`  ${m.home} v ${m.away}: model H${(r.homeWin * 100).toFixed(0)}/D${(r.draw * 100).toFixed(0)}/A${(r.awayWin * 100).toFixed(0)}${d ? `  vs market ΔH${(d.homeWin * 100).toFixed(0)}pp` : "  (no market)"}`);
}
