#!/usr/bin/env node
/**
 * SETTLE THE PARLAY LAB — grade the day's published ladder from official results.
 *
 * The ladder publishes one card per tier before first pitch. This grades those exact cards, writes
 * a DATED, WRITE-ONCE receipt, and stops. The ledger is rebuilt from the receipts separately, so a
 * bad run here can never silently rewrite the record.
 *
 * RULES, deliberately conservative — the same ones the MLB player-prop settler uses:
 *   · a game that is not FINAL leaves its leg PENDING, never a loss
 *   · a player absent from the official box score is PENDING — a scratch is not a losing bet
 *   · a card is LOST the moment any leg loses, WON only when every leg wins
 *   · a settled day is written ONCE; an identical re-run is a no-op, a differing one refuses
 *
 *   node app/scripts/parlays/settle-lab-cards.mjs --now <ISO> [--date YYYY-MM-DD] [--apply]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LADDER = path.join(APP, "public", "data", "parlays", "risk-ladder");
const RECEIPTS = path.join(APP, "public", "data", "parlays", "lab-settled");

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const apply = process.argv.includes("--apply");

/**
 * Default to YESTERDAY IN ET, not the UTC day. Settlement runs after midnight ET when UTC has
 * already rolled over, so slicing an ISO instant names a slate that has not been played — the exact
 * trap that made the first automated MLB settlement a silent no-op.
 */
const etYesterday = () => {
  const et = new Date(new Date(NOW).toLocaleString("en-US", { timeZone: "America/New_York" }));
  et.setDate(et.getDate() - 1);
  return `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, "0")}-${String(et.getDate()).padStart(2, "0")}`;
};
const DATE = arg("--date", etYesterday());

const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const get = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); };
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/** The stat a market settles on, from one player's official box-score line. */
function actualFor(market, stats) {
  const b = stats?.batting ?? {}, p = stats?.pitching ?? {};
  const label = String(market ?? "").toLowerCase();
  if (label.includes("strikeout")) return p.strikeOuts ?? null;
  if (label.includes("out")) return p.outs ?? null;
  if (label.includes("earned")) return p.earnedRuns ?? null;
  if (label.includes("total base")) {
    if (b.hits == null) return null;
    const singles = (b.hits ?? 0) - (b.doubles ?? 0) - (b.triples ?? 0) - (b.homeRuns ?? 0);
    return singles + 2 * (b.doubles ?? 0) + 3 * (b.triples ?? 0) + 4 * (b.homeRuns ?? 0);
  }
  if (label.includes("runs") && label.includes("rbi")) {
    if (b.hits == null) return null;
    return (b.hits ?? 0) + (b.runs ?? 0) + (b.rbi ?? 0);
  }
  if (label.includes("hit")) return b.hits ?? null;
  return null;
}

const boxCache = new Map();
async function boxFor(gamePk) {
  if (!gamePk) return { final: false, byPlayer: new Map() };
  if (boxCache.has(gamePk)) return boxCache.get(gamePk);
  const out = { final: false, byPlayer: new Map() };
  try {
    const feed = await get(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
    out.final = feed?.gameData?.status?.abstractGameState === "Final";
    for (const side of ["away", "home"]) {
      for (const p of Object.values(feed?.liveData?.boxscore?.teams?.[side]?.players ?? {})) {
        if (p?.person?.fullName) out.byPlayer.set(norm(p.person.fullName), p.stats ?? {});
      }
    }
  } catch (e) { console.error(`  gamePk ${gamePk}: ${e.message}`); }
  boxCache.set(gamePk, out);
  return out;
}

const ladder = (() => { try { return JSON.parse(fs.readFileSync(path.join(LADDER, `${DATE}.json`), "utf8")); } catch { return null; } })();
if (!ladder) { console.log(`NOT_YET_OBSERVABLE: no published ladder for ${DATE}`); process.exit(0); }

const cards = [];
for (const card of ladder.cards ?? []) {
  const results = [];
  let combined = 1;
  for (const leg of card.legs ?? []) {
    if (leg.odds != null) combined *= dec(leg.odds);
    const box = await boxFor(leg.gamePk);
    if (!box.final) { results.push("pending"); continue; }
    const stats = box.byPlayer.get(norm(leg.player));
    if (!stats) { results.push("pending"); continue; }         // scratch — never a loss
    const actual = actualFor(leg.marketLabel, stats);
    if (actual == null) { results.push("pending"); continue; }
    const over = String(leg.side ?? "").toLowerCase().startsWith("o");
    results.push(actual === leg.line ? "push" : (actual > leg.line) === over ? "win" : "loss");
  }
  const decisive = results.filter((r) => r !== "push");
  const result = results.includes("pending") && !results.includes("loss") ? "pending"
    : decisive.includes("loss") ? "loss"
    : decisive.length && decisive.every((r) => r === "win") ? "win"
    : "pending";
  cards.push({ sport: "mlb", tier: card.tier, slipId: card.slipId, result, combinedDecimal: Number(combined.toFixed(6)), legs: results });
  console.log(`  ${card.tierLabel.padEnd(12)} ${result.toUpperCase()}`);
}

const receipt = {
  schemaVersion: 1, artifact: "parlay-lab-settlement", dataClass: "PUBLIC_DERIVED",
  date: DATE, settledAt: NOW.replace(/\.\d{3}Z$/, "Z"),
  source: "MLB Stats API official box score (feed/live), joined by gamePk",
  policyVersion: 2,
  cards,
};

const decided = cards.filter((c) => c.result !== "pending").length;
console.log(`\n${decided}/${cards.length} cards decided for ${DATE}`);
if (!apply) { console.log("dry-run — nothing written. Re-run with --apply."); process.exit(0); }
if (decided === 0) { console.log("nothing decided yet — no receipt written"); process.exit(0); }

fs.mkdirSync(RECEIPTS, { recursive: true });
const out = path.join(RECEIPTS, `${DATE}.json`);
if (fs.existsSync(out)) {
  const prior = JSON.parse(fs.readFileSync(out, "utf8"));
  const same = JSON.stringify(prior.cards) === JSON.stringify(receipt.cards);
  console.log(same ? `receipt ${DATE} already recorded and identical — left untouched`
                   : `REFUSED: receipt ${DATE} exists and DIFFERS. A settled day is not rewritten silently.`);
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(out, JSON.stringify(receipt, null, 1) + "\n");
console.log(`wrote parlays/lab-settled/${DATE}.json`);
