/**
 * build-active-builder-slip — records the user-approved NBA Finals event override
 * for the Bank Builder active rung as an AUDIT artifact. Pure read of the real
 * optimizer leg pool via selectFeaturedFinalsCard; never alters settled history.
 *
 * Usage: node scripts/build-active-builder-slip.mjs <date> <isoTimestamp>
 */
import fs from "node:fs";
import path from "node:path";
import { buildFinalsCards, selectFeaturedFinalsCard } from "../src/lib/nba-finals-cards.ts";

const date = process.argv[2] || "2026-06-10";
const ts = process.argv[3] || `${date}T18:00:00Z`;
const ROOT = path.join(process.cwd(), "public", "data");

const opt = JSON.parse(fs.readFileSync(path.join(ROOT, "parlays", "optimizer", `${date}.json`), "utf8"));
const summary = JSON.parse(fs.readFileSync(path.join(ROOT, "bank-builder", "summary-latest.json"), "utf8"));
const stake = summary.currentBankrollUnits ?? 100;

const nbaLegs = opt.legPool.legs.filter((l) => l.sport === "nba");
const card = selectFeaturedFinalsCard(buildFinalsCards(nbaLegs, { perTier: 8 }));
if (!card) { console.error("No qualifying NBA Finals card"); process.exit(1); }

const ret = Math.round(stake * card.combinedDecimal * 100) / 100;
const payload = {
  date, sport: "NBA", event: "NBA Finals Game 4", status: "pending",
  paperStake: stake, stakeUnits: stake,
  combinedAmerican: card.combinedAmerican, combinedDecimal: card.combinedDecimal,
  projectedReturn: ret, projectedProfit: Math.round((ret - stake) * 100) / 100,
  sameGame: true, correlationNote: card.correlationNote,
  legs: card.legs.map((l) => ({
    player: l.playerName, playerId: l.playerId, team: l.team, opponent: l.opponent,
    market: l.market, marketLabel: l.marketLabel, side: l.side, line: l.line,
    oddsForSide: l.oddsForSide, bookmaker: l.bookmaker, confidence: l.confidence,
    projection: l.projection, edgePct: l.edgePct,
  })),
  replacement: {
    previousCandidateSport: "MLB",
    replacementReason: "user_approved_nba_finals_feature",
    replacementTimestamp: ts,
    noResultOverride: true,
    note: "Pre-tip, user-approved replacement of today's active rung. Settled history unchanged.",
  },
  generatedAt: ts, source: "optimizer_legpool",
};
const dir = path.join(ROOT, "bank-builder");
fs.writeFileSync(path.join(dir, `active-builder-slip-${date}.json`), JSON.stringify(payload, null, 2) + "\n");
fs.writeFileSync(path.join(dir, "active-builder-slip-latest.json"), JSON.stringify(payload, null, 2) + "\n");
console.log(`wrote active-builder-slip ${date}: ${card.legs.map((l)=>l.playerName+" "+l.market).join(" + ")} | +${card.combinedAmerican} | $${stake} -> $${ret}`);
