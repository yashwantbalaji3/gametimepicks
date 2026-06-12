/**
 * Tests for the Bank Builder "previous hits" summary helpers
 * (`bank-builder-previous-hits.ts`).
 *
 * The hard guarantee these lock down: the public /bank-builder previous-hits
 * display summarises each settled card by leg COUNT and MARKET only and
 * NEVER surfaces a player name. This is verified against the real public
 * ledger so a future ledger edit that adds players can't silently leak names
 * onto the public page.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  humanizeMarket,
  summarizePreviousHitLegs,
} from "./bank-builder-previous-hits.ts";

const ledger = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "public", "data", "bank-builder", "public-ledger-latest.json"),
    "utf8",
  ),
);

test("humanizeMarket converts underscores to spaces", () => {
  assert.equal(humanizeMarket("batter_hits"), "batter hits");
  assert.equal(humanizeMarket("PRA"), "PRA");
  assert.equal(humanizeMarket(""), "");
});

test("summary describes legs by count + markets, never player names", () => {
  // Step 1 (MLB) — both legs are batter_hits → deduped to one market.
  const s1 = ledger.entries.find((e) => e.step === 1);
  const sum1 = summarizePreviousHitLegs(s1);
  assert.equal(sum1, "2-leg card · batter hits");

  // Step 2 (NBA Finals) — same-game card, two distinct markets.
  const s2 = ledger.entries.find((e) => e.step === 2);
  const sum2 = summarizePreviousHitLegs(s2);
  assert.equal(sum2, "2-leg same-game card · REB · PRA");

  // No real player name from the ledger may appear in any summary.
  const players = ledger.entries.flatMap((e) => (e.legs ?? []).map((l) => l.player));
  assert.ok(players.length >= 4, "fixture sanity: ledger carries player legs");
  for (const e of ledger.entries) {
    const summary = summarizePreviousHitLegs(e) ?? "";
    for (const p of players) {
      assert.ok(!summary.includes(p), `summary leaked player "${p}": ${summary}`);
    }
    // Specifically guard the names the cleanup explicitly bans on the page.
    for (const banned of ["Seager", "Hoerner", "Ohtani", "Castle", "Anunoby"]) {
      assert.ok(!summary.includes(banned), `summary leaked "${banned}"`);
    }
  }
});

test("summary returns null when an entry has no leg detail", () => {
  assert.equal(summarizePreviousHitLegs({ legs: [] }), null);
  assert.equal(summarizePreviousHitLegs({}), null);
});
