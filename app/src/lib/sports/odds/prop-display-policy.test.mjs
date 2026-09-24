/**
 * THE DISPLAYED PROP PRICE COMES FROM ONE NAMED BOOK (founder decision, 2026-09-24).
 *
 * DraftKings is the reference sportsbook for displayed NFL prop prices. The number a reader sees is
 * DraftKings' own, attributed to DraftKings. This pins the three ways that could quietly stop being
 * true, because each would put a price on screen under an attribution that does not own it:
 *
 *   1. SUBSTITUTION — falling back to another book when DraftKings has not posted. The row would
 *      say "DraftKings" over someone else's number.
 *   2. BLENDING — averaging, median-ing or otherwise synthesising across books. A blended price has
 *      no book to attribute it to, and `twoWayConsensus` was built for two-way TEAM markets, not
 *      for a one-sided anytime-TD price.
 *   3. INFERENCE — completing a half-returned two-sided market, or defaulting a missing side to
 *      -110. The opposite side of a market is never a thing we know.
 *
 * Run: npx tsx --test src/lib/sports/odds/prop-display-policy.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC = fs.readFileSync(path.join(process.cwd(), "scripts/nfl/capture-nfl-odds.mjs"), "utf8");

test("exactly ONE reference book is named, and the published rows are filtered to it", () => {
  const decl = /const REFERENCE_BOOK = "([a-z_]+)";/.exec(SRC);
  assert.ok(decl, "no REFERENCE_BOOK declared — the display policy has no single owner");
  assert.equal(decl[1], "draftkings", "the founder named DraftKings as the reference sportsbook");

  const block = /propPrices: propProbe\?\.state === "PROBED"[\s\S]*?\n    : null,/.exec(SRC)?.[0];
  assert.ok(block, "the propPrices block is no longer identifiable — this guard would scan nothing");

  // Every published row is filtered to the reference book, and says so.
  const filters = [...block.matchAll(/\.filter\(\(r\) => r\.bookmaker === REFERENCE_BOOK\)/g)];
  assert.equal(filters.length, 2, "both families (anytime TD and the two-sided lines) must filter to the reference book");
  assert.match(block, /sportsbook: REFERENCE_BOOK/, "each row must be ATTRIBUTED to the book it came from");
});

test("no substitution, no blending, no inferred side", () => {
  const block = /propPrices: propProbe\?\.state === "PROBED"[\s\S]*?\n    : null,/.exec(SRC)[0];

  // 2 · blending
  for (const banned of ["medianOf", "twoWayConsensus", "average", "consensusPrice"]) {
    assert.ok(!block.includes(banned),
      `${banned} must not build a DISPLAYED prop price — a blended number has no book to attribute it to`);
  }

  // 1 · substitution — the only book mentioned in the published block is the reference book
  const books = [...block.matchAll(/"(draftkings|fanduel|betmgm|betrivers|fanatics|bovada|betonlineag|williamhill_us)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(books)], [], "no book should be hardcoded in the published block — it must go through REFERENCE_BOOK");

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

test("a two-sided market pairs by player AND point — an Over at 71.5 is not an Under at 74.5", () => {
  const grouping = /const key = `\$\{playerId\}\|\$\{o\.point\}`;/.exec(SRC);
  assert.ok(grouping, "two-sided outcomes must be grouped by player AND point, or alternate lines cross-pair");
});
