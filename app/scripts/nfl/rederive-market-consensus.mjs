#!/usr/bin/env node
/**
 * RE-DERIVE THE NFL MARKET CONSENSUS FROM PRICES ALREADY CAPTURED (P276). ZERO CREDITS.
 *
 * The published artifact carries every book's de-vigged pair per event, so the consensus is a pure
 * function of what is already on disk. When that function is corrected, the committed capture can
 * be brought into line without buying the prices again — which matters, because the alternative is
 * spending a founder's credits to fix our own arithmetic.
 *
 * It rewrites ONLY the `consensus` block of `public/data/nfl/markets/latest.json` (and the stamped
 * capture file beside it, when the stamps match). Prices, books, ids, kickoffs and `capturedAt` are
 * facts from the provider and are never touched: this changes how we summarise them, not what they
 * were.
 *
 *   node scripts/nfl/rederive-market-consensus.mjs [--check]
 *
 * --check reports what would change and writes nothing. Exit 0 when nothing needed changing, 0
 * after a successful rewrite, 1 on a refusal.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { twoWayConsensus } from "../../src/lib/sports/odds/consensus.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHECK = process.argv.includes("--check");
const dir = path.join(APP, "public", "data", "nfl", "markets");
const latestPath = path.join(dir, "latest.json");

if (!fs.existsSync(latestPath)) {
  console.error(`REFUSED: no capture at ${latestPath}`);
  process.exit(1);
}
const doc = JSON.parse(fs.readFileSync(latestPath, "utf8"));
const rows = doc.rows ?? [];
if (!rows.length) {
  console.log("nothing to re-derive: the capture carries no rows");
  process.exit(0);
}

let changed = 0;
for (const row of rows) {
  const before = row.consensus ?? {};
  const two = twoWayConsensus(row.books ?? []);
  if (two.homeWinProbNoVig == null) {
    console.log(`skip ${row.away?.abbr}@${row.home?.abbr}: books carry no two-way pair to summarise`);
    continue;
  }
  const moved = before.homeWinProbNoVig !== two.homeWinProbNoVig || before.awayWinProbNoVig !== two.awayWinProbNoVig;
  if (moved) {
    changed += 1;
    const sumBefore = (before.homeWinProbNoVig ?? 0) + (before.awayWinProbNoVig ?? 0);
    console.log(
      `${row.away?.abbr}@${row.home?.abbr}: ${Number(before.homeWinProbNoVig).toFixed(4)}/${Number(before.awayWinProbNoVig).toFixed(4)}` +
      ` (sum ${sumBefore.toFixed(4)}) → ${two.homeWinProbNoVig.toFixed(4)}/${two.awayWinProbNoVig.toFixed(4)} (sum 1)`,
    );
  }
  if (!CHECK) {
    row.consensus = {
      ...before,
      homeWinProbNoVig: two.homeWinProbNoVig,
      awayWinProbNoVig: two.awayWinProbNoVig,
      basis: two.basis,
      preNormalisedSum: two.preNormalisedSum,
    };
  }
}

if (CHECK) {
  console.log(changed ? `${changed} of ${rows.length} event(s) would move` : "every consensus already matches its books");
  process.exit(0);
}
if (!changed) {
  console.log("every consensus already matches its books — nothing written");
  process.exit(0);
}

/* The stamped sibling is the same capture under its own name; rewriting only `latest.json` would
   leave the two disagreeing about the same moment. */
const stamped = fs.readdirSync(dir).filter((f) => /^capture-\d{8}T\d{4}\.json$/.test(f)).sort().at(-1);
const targets = [latestPath];
if (stamped) {
  const sp = path.join(dir, stamped);
  const s = JSON.parse(fs.readFileSync(sp, "utf8"));
  if (s.capturedAt === doc.capturedAt) targets.push(sp);
}
for (const t of targets) fs.writeFileSync(t, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`re-derived ${changed} event(s) · wrote ${targets.map((t) => path.basename(t)).join(", ")} · zero credits`);
