/**
 * THE CAPTURE SIDE of the displayed-prop-price policy — what the script must never DO to a market
 * before a book is chosen. The choosing itself moved to lib/sports/odds/prop-display-selection.mjs
 * and is executed there against constructed evidence; this file guards what can only be seen in
 * the capture's own source, where the provider response is taken apart.
 *
 * ⚠ THE FIRST TEST HERE PINNED A SINGLE-BOOK FILTER and went red when the founder authorized the
 * DraftKings → FanDuel → most-complete ladder on 2026-09-24. It had been asserting the SHAPE of
 * the code ("two `.filter(r => r.bookmaker === REFERENCE_BOOK)` calls") rather than the rule, so a
 * legitimate policy change read as a regression while a genuine mis-attribution would have read as
 * a pass. Deleting it would have left the rule unguarded; it was replaced by executable guards
 * instead, and what remains below is the part that is genuinely about this file.
 *
 *   1. INFERENCE — completing a half-returned two-sided market, or defaulting a missing side to
 *      -110. The opposite side of a market is never a thing we know.
 *   2. CROSS-PAIRING — an Over at 71.5 is not an Under at 74.5, even from the same book.
 *
 * Run: npx tsx --test src/lib/sports/odds/prop-display-policy.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC = fs.readFileSync(path.join(process.cwd(), "scripts/nfl/capture-nfl-odds.mjs"), "utf8");

test("a half-returned market is quarantined, never completed or defaulted", () => {
  // 3 · inference — a half-returned two-sided market is quarantined, never completed
  const pairing = /for \(const slot of bySide\.values\(\)\) \{[\s\S]*?\n            \}/.exec(SRC)?.[0];
  assert.ok(pairing, "the two-sided pairing block is no longer identifiable");
  assert.match(pairing, /overPrice == null \|\| slot\.underPrice == null \|\| slot\.line == null/,
    "a missing side or point must be detected");
  assert.match(pairing, /never inferred/, "…and the refusal must say the missing side is not inferred");

  /* ⚠ Scan CODE, not prose. The block's own comment says "never defaulted to -110", so a naive
     search for that literal matches the sentence promising not to do it. Strip comments first. */
  const code = pairing.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  assert.ok(!/-110/.test(code), "a missing side must never be defaulted to -110 in code");
});

test("the capture never blends a displayed prop price", () => {
  /* twoWayConsensus/medianOf are imported for TEAM markets and legitimately used there. The ban is
     that neither may touch the PROP path, so the scan is scoped to the prop-probe block. */
  const propBlock = /if \(PROBE\) \{[\s\S]*?\n\/\/ -+ artifacts/.exec(SRC)?.[0];
  assert.ok(propBlock, "the prop-probe block is no longer identifiable — this guard would scan nothing");
  for (const banned of ["medianOf", "twoWayConsensus", "consensusPrice"]) {
    assert.ok(!propBlock.includes(banned),
      `${banned} must not touch a prop price — a blended number has no book to attribute it to`);
  }
});

test("a two-sided market pairs by player AND point — an Over at 71.5 is not an Under at 74.5", () => {
  const grouping = /const key = `\$\{playerId\}\|\$\{o\.point\}`;/.exec(SRC);
  assert.ok(grouping, "two-sided outcomes must be grouped by player AND point, or alternate lines cross-pair");
});
