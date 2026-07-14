#!/usr/bin/env node
/**
 * INTERNAL diagnostic: for the 2026 semifinals, compare the de-vigged MARKET 1X2 vs the UNTUNED engine vs the
 * (overfit, NOT-adopted) full-sample "best" tuned config. Purely to see the spread — this is NOT a product input
 * and is NOT public. The tuned config is shown for reference only; the 2022 CV/bootstrap showed it does not
 * generalize, so the engine defaults are unchanged.
 *
 * Writes (INTERNAL ONLY): data/internal/world-cup/projection-engine/diagnostics/2026-semis-tuned-vs-market.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { projectMatch } from "../src/lib/world-cup/internal-soccer-projection-engine.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const APP = path.resolve(__dirname, "..");
const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();

const tsRaw = JSON.parse(fs.readFileSync(path.join(APP, "public/data/world-cup/team-strength/team-strength-latest.json"), "utf8"));
const ratings = tsRaw.teams || tsRaw.ratings || Object.values(tsRaw).find(Array.isArray) || [];
const fifa = new Map(ratings.filter((t) => typeof t.fifaPoints === "number").map((t) => [norm(t.team), t.fifaPoints]));

const proj = JSON.parse(fs.readFileSync(path.join(APP, "public/data/world-cup/projections/latest.json"), "utf8"));
const TUNED = { supremacyPerFifaPoint: 0.0045, baseTotalGoals: 2.9, drawInflation: 1.05, supremacyCap: 2.6 };

const fixtures = new Map();
for (const r of proj.matches || []) {
  const id = String(r.matchId);
  if (!fixtures.has(id)) fixtures.set(id, { home: r.homeTeam, away: r.awayTeam, stage: r.stage, market: null, totalLine: null });
  const f = fixtures.get(id);
  if (String(r.market).toLowerCase() === "moneyline_90" && Array.isArray(r.outcomes)) {
    f.market = {};
    for (const o of r.outcomes) { if (o.side === "home") f.market.homeWin = o.marketProbability; else if (o.side === "draw") f.market.draw = o.marketProbability; else if (o.side === "away") f.market.awayWin = o.marketProbability; }
  }
  if (String(r.market).toLowerCase() === "match_total_goals" && r.line != null) f.totalLine = Number(r.line);
}

const out = [];
for (const f of fixtures.values()) {
  const hf = fifa.get(norm(f.home)), af = fifa.get(norm(f.away));
  if (hf == null || af == null || !f.market) continue;
  const untuned = projectMatch({ homeFifaPoints: hf, awayFifaPoints: af }).matchResult90;
  const tuned = projectMatch({ homeFifaPoints: hf, awayFifaPoints: af, ...TUNED }).matchResult90;
  const pp = (x) => +(x * 100).toFixed(1);
  out.push({
    match: `${f.home} vs ${f.away}`, stage: f.stage,
    market: { home: pp(f.market.homeWin), draw: pp(f.market.draw), away: pp(f.market.awayWin) },
    untuned: { home: pp(untuned.homeWin), draw: pp(untuned.draw), away: pp(untuned.awayWin) },
    tunedRefOnly: { home: pp(tuned.homeWin), draw: pp(tuned.draw), away: pp(tuned.awayWin) },
    deltaUntunedVsMarket: { home: +(pp(untuned.homeWin) - pp(f.market.homeWin)).toFixed(1), away: +(pp(untuned.awayWin) - pp(f.market.awayWin)).toFixed(1) },
  });
}

const artifact = {
  version: "semis-diagnostic-v1", asOf: "2026-07-14",
  public: false, internalOnly: true, notForProducts: true, webServed: false, officialMoneyRecordAffected: false,
  note: "Market = de-vigged sportsbook 1X2. Untuned = engine defaults (adopted). tunedRefOnly = full-sample best from the 2022 grid — NOT adopted (overfit; failed CV + bootstrap). Diagnostic only; not a pick, not public.",
  fixtures: out,
};
const outDir = path.join(REPO, "data/internal/world-cup/projection-engine/diagnostics");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "2026-semis-tuned-vs-market.json"), JSON.stringify(artifact, null, 2));
console.log("✓ wrote semis diagnostic (internal-only, notForProducts)");
for (const f of out) console.log(`  ${f.match}: market H${f.market.home}/D${f.market.draw}/A${f.market.away} | untuned H${f.untuned.home}/D${f.untuned.draw}/A${f.untuned.away} | ΔuntunedAway ${f.deltaUntunedVsMarket.away}pp`);
