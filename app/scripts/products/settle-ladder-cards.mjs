#!/usr/bin/env node
/**
 * Settle the Bank Builder ladder and the Moonshot lane from official MLB box scores.
 *
 * These two stores hold the products' real cards, and until now no scheduled job opened either one.
 * Both carried cards frozen on 2026-08-17 that were still pending nineteen days later.
 *
 *   npx tsx app/scripts/products/settle-ladder-cards.mjs                 # dry run, writes nothing
 *   npx tsx app/scripts/products/settle-ladder-cards.mjs --apply
 *   npx tsx app/scripts/products/settle-ladder-cards.mjs --root <dir>    # fixture store
 *
 * Dry run is the DEFAULT. P235 lost time to a "harmless" smoke test that re-stamped two committed
 * settlement artifacts; a settler whose default writes is a settler that will eventually write
 * something nobody asked for.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { settleProductLadders } from "../../src/lib/products/ladder-settlement.mjs";
import { normName } from "../../src/lib/products/mlb-prop-grading.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const root = path.resolve(arg("--root", path.join(APP, "public", "data")));
const apply = process.argv.includes("--apply");
const nowIso = arg("--now", new Date().toISOString().replace(/\.\d{3}Z$/, "Z"));

/** One live box-score read per game, cached. The only network this settler performs, and it is the
 *  free official StatsAPI feed — no provider credits are involved in grading. */
const cache = new Map();
async function fetchBox(gamePk) {
  if (cache.has(gamePk)) return cache.get(gamePk);
  let out = { final: false, byPlayer: new Map() };
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
    if (!res.ok) throw new Error(`${res.status}`);
    const feed = await res.json();
    out.final = feed?.gameData?.status?.abstractGameState === "Final";
    for (const side of ["away", "home"]) {
      for (const p of Object.values(feed?.liveData?.boxscore?.teams?.[side]?.players ?? {})) {
        if (p?.person?.fullName) out.byPlayer.set(normName(p.person.fullName), p.stats ?? {});
      }
    }
  } catch (e) {
    console.error(`  gamePk ${gamePk}: ${e.message} — leg holds`);
  }
  cache.set(gamePk, out);
  return out;
}

const r = await settleProductLadders({ root, fetchBox, nowIso, apply });

console.log(`=== Ladder settlement · ${apply ? "APPLY" : "DRY RUN"} · ${nowIso} ===`);
console.log(`stores present: Bank Builder ${r.stores.bankBuilder ? "yes" : "no"} · Moonshot ${r.stores.moonshot ? "yes" : "no"}`);
for (const c of r.cards) {
  console.log(`\n${c.product} lane ${c.lane.toUpperCase()} · ${c.id}`);
  for (const l of c.legs) {
    console.log(`   ${l.player} ${l.side} ${l.line} ${l.market} → ${l.actual ?? "—"}  ${String(l.result).toUpperCase()}${l.note ? `  (${l.note})` : ""}`);
  }
  console.log(`   card ${String(c.result).toUpperCase()} · ${c.applied ? c.transition.toUpperCase() : "NOT APPLIED"} — ${c.reason}`);
}
console.log(`\n${r.settled} settled · ${r.held} held`);

if (apply && r.settled > 0) {
  // The ledger itself is written by settleProductLadders — one writer, one path. This only reports it.
  console.log(`ledger → public/data/products/lifecycle/${nowIso.slice(0, 10)}.json (+ latest.json)`);
} else if (!apply) {
  console.log("DRY RUN — nothing written. Re-run with --apply.");
}
