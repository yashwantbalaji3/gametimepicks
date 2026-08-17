#!/usr/bin/env node
/**
 * Settle MLB PLAYER-PROP paper legs from the official MLB Stats API box score.
 *
 * Team markets already had a settler; player props were explicitly left PENDING because "their
 * actuals are not wired into paper settlement here". That was honest but it meant the Bank Builder
 * and Moonshot lanes — which are built almost entirely from player props — could never settle. This
 * closes that gap using the one source this repository trusts for baseball truth: the official box
 * score, joined by gamePk.
 *
 * RULES, deliberately conservative:
 *   · A game that is not FINAL is left PENDING. Never graded early, never counted as a loss.
 *   · A player who does not appear in the box score is PENDING, not a loss — he may be a late
 *     scratch, and a scratch is not a losing bet.
 *   · Exactly-on-the-line is a PUSH (only possible on integer lines; our lines are half-points, so
 *     this should never fire — it exists so it cannot silently become a loss if one ever does).
 *   · A card is LOST the moment any leg loses, WON only when every leg wins, PENDING otherwise.
 *
 *   npx tsx app/scripts/settle-mlb-player-props.mjs --date 2026-08-15
 *   npx tsx app/scripts/settle-mlb-player-props.mjs --date 2026-08-15 --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DP = path.join(APP, "public", "data", "mr-dub", "daily-portfolio.json");
/**
 * Settlement must survive the daily roll. `daily-portfolio.json` is REGENERATED every morning by the
 * products job, so a grade written only there is gone by the next day — which is exactly what
 * happened to the Aug 15 results. Every run also writes a DATED RECEIPT, and that receipt is the
 * durable record; the daily file is just today's working copy.
 */
const RECEIPTS = path.join(APP, "public", "data", "mr-dub", "settled");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
/**
 * Default to YESTERDAY IN ET, not the UTC calendar day. Settlement runs after midnight ET, when UTC
 * has already rolled over — so `toISOString().slice(0,10)` names a slate that has not been played.
 * The first automated run did exactly that, refused the date mismatch, and settled nothing.
 */
const etYesterday = () => {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  et.setDate(et.getDate() - 1);
  return `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, "0")}-${String(et.getDate()).padStart(2, "0")}`;
};
const DATE = arg("--date", etYesterday());
const apply = process.argv.includes("--apply");

const get = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};

/** Pull the actual stat a market settles on, out of one player's box-score line. */
function actualFor(market, stats) {
  const b = stats?.batting ?? {};
  const p = stats?.pitching ?? {};
  switch (market) {
    case "pitcher_strikeouts": return p.strikeOuts ?? null;
    case "batter_hits": return b.hits ?? null;
    case "batter_total_bases": {
      if (b.hits == null) return null;
      const singles = (b.hits ?? 0) - (b.doubles ?? 0) - (b.triples ?? 0) - (b.homeRuns ?? 0);
      return singles + 2 * (b.doubles ?? 0) + 3 * (b.triples ?? 0) + 4 * (b.homeRuns ?? 0);
    }
    case "batter_hits_runs_rbis":
      if (b.hits == null) return null;
      return (b.hits ?? 0) + (b.runs ?? 0) + (b.rbi ?? 0);
    default: return null;
  }
}

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/** gamePk → { status, byPlayer: Map<normalisedName, stats> } */
const boxCache = new Map();
async function boxFor(gamePk) {
  if (boxCache.has(gamePk)) return boxCache.get(gamePk);
  let out = { final: false, byPlayer: new Map() };
  try {
    const feed = await get(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
    const state = feed?.gameData?.status?.abstractGameState;
    out.final = state === "Final";
    for (const side of ["away", "home"]) {
      const players = feed?.liveData?.boxscore?.teams?.[side]?.players ?? {};
      for (const p of Object.values(players)) {
        const name = p?.person?.fullName;
        if (name) out.byPlayer.set(norm(name), p.stats ?? {});
      }
    }
  } catch (e) {
    console.error(`  gamePk ${gamePk}: ${e.message}`);
  }
  boxCache.set(gamePk, out);
  return out;
}

const dp = JSON.parse(fs.readFileSync(DP, "utf8"));
if (dp.date !== DATE) {
  console.error(`daily-portfolio is dated ${dp.date}, not ${DATE} — refusing to settle the wrong slate`);
  process.exit(1);
}

let graded = 0, pending = 0;
for (const lane of dp.lanes ?? []) {
  if (lane.status !== "active") continue;
  const results = [];
  for (const leg of lane.legs ?? []) {
    const gamePk = String(leg.eventId ?? (leg.legId ?? "").split(":")[2] ?? "");
    const market = leg.marketType ?? leg.market;
    const player = leg.participantName ?? leg.participant?.replace(/\s+(Over|Under)\s.*$/, "") ?? "";
    const box = await boxFor(gamePk);
    if (!box.final) {
      leg.settlement = { ...(leg.settlement ?? {}), result: "pending", official: null, note: "game not final" };
      results.push("pending"); pending++; continue;
    }
    const stats = box.byPlayer.get(norm(player));
    if (!stats) {
      leg.settlement = { ...(leg.settlement ?? {}), result: "pending", official: null, note: "player absent from the official box score (possible scratch) — never graded as a loss" };
      results.push("pending"); pending++; continue;
    }
    const actual = actualFor(market, stats);
    if (actual == null) {
      leg.settlement = { ...(leg.settlement ?? {}), result: "pending", official: null, note: `no ${market} line in the box score` };
      results.push("pending"); pending++; continue;
    }
    const line = Number(leg.line);
    const over = leg.side === "over";
    const r = actual === line ? "push" : (actual > line) === over ? "won" : "lost";
    leg.settlement = { ...(leg.settlement ?? {}), result: r, official: actual, source: "mlb_stats_api", gamePk };
    results.push(r); graded++;
    console.log(`  ${lane.productLabel} ${lane.lane}: ${player} ${leg.side} ${line} ${market} → ${actual} ${r.toUpperCase()}`);
  }
  const decisive = results.filter((r) => r !== "push");
  lane.result = decisive.includes("lost") ? "lost"
    : decisive.length && decisive.every((r) => r === "won") ? "won"
    : "pending";
  if (lane.result !== "pending") {
    lane.status = lane.result;
    lane.exposure = 0;                    // settled — the stake is no longer at risk
    lane.settledAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    if (lane.result === "won") lane.clearedSteps = 1;
  }
  console.log(`  → ${lane.productLabel} Lane ${lane.lane}: ${lane.result.toUpperCase()}`);
}

const openExposure = Math.round((dp.lanes ?? []).reduce((n, l) => n + (l.exposure ?? 0), 0) * 100) / 100;
dp.openExposure = openExposure;
dp.availableBankroll = Math.round(((dp.activeBankroll ?? 0) - openExposure) * 100) / 100;
for (const [key, product] of [["bankBuilder", "bank-builder"], ["moonshot", "moonshot"]]) {
  const ls = (dp.lanes ?? []).filter((l) => l.product === product);
  dp.products[key] = {
    exposure: Math.round(ls.reduce((n, l) => n + (l.exposure ?? 0), 0) * 100) / 100,
    record: {
      wins: ls.filter((l) => l.result === "won").length,
      losses: ls.filter((l) => l.result === "lost").length,
      voids: 0,
      pending: ls.filter((l) => (l.result ?? "pending") === "pending").length,
    },
  };
}

console.log(`\n${graded} legs graded, ${pending} pending · open exposure now $${openExposure}`);
console.log((dp.lanes ?? []).map((l) => `  ${l.productLabel} ${l.lane}: ${String(l.result ?? "pending").toUpperCase()}`).join("\n"));
if (!apply) { console.log("\ndry-run — nothing written. Re-run with --apply."); process.exit(0); }
fs.mkdirSync(RECEIPTS, { recursive: true });
const receipt = {
  date: DATE,
  settledAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  source: "MLB Stats API official box score (feed/live), joined by gamePk",
  lanes: (dp.lanes ?? []).map((l) => ({
    product: l.product, lane: l.lane, step: l.step, stake: l.stake,
    result: l.result ?? "pending", potentialReturn: l.potentialReturn,
    legs: (l.legs ?? []).map((g) => ({
      player: g.participantName ?? g.participant ?? null,
      market: g.marketType ?? g.market, side: g.side, line: g.line,
      official: g.settlement?.official ?? null, result: g.settlement?.result ?? "pending",
    })),
  })),
  record: {
    wins: (dp.lanes ?? []).filter((l) => l.result === "won").length,
    losses: (dp.lanes ?? []).filter((l) => l.result === "lost").length,
    pending: (dp.lanes ?? []).filter((l) => (l.result ?? "pending") === "pending").length,
  },
};
// A settled day is written ONCE. Re-running must never silently rewrite history.
const receiptPath = path.join(RECEIPTS, `${DATE}.json`);
if (fs.existsSync(receiptPath)) {
  const prior = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  const same = JSON.stringify(prior.lanes) === JSON.stringify(receipt.lanes);
  console.log(same
    ? `\nreceipt ${DATE} already recorded and identical — left untouched`
    : `\nREFUSED: receipt ${DATE} exists and DIFFERS from this run. A settled day is not rewritten silently.`);
  if (!same) process.exit(1);
} else {
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 1) + "\n");
  console.log(`\nwrote durable receipt mr-dub/settled/${DATE}.json`);
}
fs.writeFileSync(DP, JSON.stringify(dp, null, 2) + "\n");
console.log("wrote mr-dub/daily-portfolio.json");
