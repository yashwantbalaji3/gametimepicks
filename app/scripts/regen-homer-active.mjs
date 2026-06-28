/**
 * Regenerate homer-nukes-active.json from the FRESH daily board (loadHomerNukes), so the displayed
 * "active" Homer Nukes parlay matches today's MLB slate instead of a stale snapshot. The board derives
 * from mlb/home-run-props/<date>.json (official Odds API props) — never fabricated. Paper product
 * (separate ledger); does not touch the canonical bankroll/crown.
 *   cd app && npx tsx scripts/regen-homer-active.mjs --date 2026-06-28 --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadHomerNukes } from "../src/lib/mlb/homer-nukes.ts";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const apply = argv.includes("--apply");
const date = arg("--date", new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }));
const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
const OUT = path.join(DATA, "mlb", "homer-nukes-active.json");

const board = loadHomerNukes(DATA, date);
if (!board.available || !(board.lanes ?? []).length) {
  // Honest skip: no fresh board → write an empty, dated active artifact (no stale players render).
  const empty = { date, generatedAt: new Date().toISOString(), stake: 0, exposure: 0, confidence: "low", lanes: [], note: board.note ?? "No MLB home-run board for this slate." };
  console.log(`Homer board NOT available for ${date} — writing empty active artifact (honest skip).`);
  if (apply) fs.writeFileSync(OUT, JSON.stringify(empty, null, 2) + "\n");
  process.exit(0);
}
const active = {
  date, generatedAt: new Date().toISOString(),
  stake: board.stake, exposure: board.stake, confidence: board.confidence ?? "medium",
  lanes: board.lanes.map((l) => ({
    lane: l.lane, stake: l.stake, combinedOdds: l.combinedOdds, projectedReturn: l.projectedReturn,
    impliedProbability: l.impliedProbability,
    legs: (l.legs ?? []).map((g) => ({
      player: g.player, playerId: g.playerId ?? null, photoUrl: g.photoUrl ?? null,
      team: g.teamAbbr ?? g.team ?? null, matchup: g.matchup ?? null,
      odds: g.odds ?? g.americanOdds ?? null, modelProbability: g.modelProbability ?? null,
    })),
  })),
};
console.log(`Homer active ${date}: ${active.lanes.length} lanes · players: ${active.lanes.flatMap((l) => l.legs.map((g) => g.player)).join(", ")}`);
if (!apply) { console.log("DRY-RUN — no write."); process.exit(0); }
fs.writeFileSync(OUT, JSON.stringify(active, null, 2) + "\n");
console.log("APPLIED → homer-nukes-active.json regenerated from the fresh board.");
