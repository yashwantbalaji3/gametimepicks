#!/usr/bin/env node
/**
 * Build the Mr. Dub MASTER LEDGER artifact (mr-dub/master-ledger.json) — the authoritative cross-product
 * paper track record. READ-ONLY over each product's persisted ledger + the daily portfolio; NEVER mutates
 * bankroll/crown/records. Stale products contribute no open exposure.
 *
 *   npx tsx app/scripts/build-master-ledger.mjs --date 2026-06-24
 */
import fs from "node:fs";
import path from "node:path";
import { buildMasterLedger } from "../src/lib/mr-dub/master-ledger.ts";

const args = process.argv.slice(2);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const date = val("--date", new Date().toISOString().slice(0, 10));
const nowIso = `${date}T18:00:00Z`;
const root = path.join(process.cwd(), "app", "public", "data");
const OUT = path.join(root, "mr-dub", "master-ledger.json");

const ledger = buildMasterLedger(root, nowIso, date);
ledger.note = "Product paper track record (each product's own settled ledger). SEPARATE from the canonical Bank Builder seed-model bankroll/crown, which are never derived from this view.";

fs.writeFileSync(OUT, JSON.stringify(ledger, null, 2) + "\n");
console.log(`=== Mr. Dub master ledger · ${date} ===`);
for (const p of ledger.products) {
  console.log(`  ${p.label.padEnd(18)} ${p.record.wins}-${p.record.losses} · roi ${p.roi}% · pnl $${p.profit} · exp $${p.exposure} · ${p.stale ? "STALE" : "active"}`);
}
console.log(`  AGGREGATE  ${ledger.aggregate.wins}-${ledger.aggregate.losses} · roi ${ledger.aggregate.roi}% · pnl $${ledger.aggregate.profit} · exposure $${ledger.aggregate.exposure}`);
console.log(`  → wrote ${path.relative(process.cwd(), OUT)}`);
