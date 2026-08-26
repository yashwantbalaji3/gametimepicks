/**
 * OPTIMIZER-CARD DRAFT IDENTITY guards (P209 · Release F) — closing P208's named gap.
 *
 * The optimizer artifact always decomposed its legs (playerName/marketLabel/side/line/oddsForSide);
 * normalization flattened that into a display label, which is why these cards could not seed the
 * shared draft. The identity now rides through fail-closed. These guards pin the contract with
 * synthetic slips (never today's data), plus the two consumer rules: the card UI offers Customize
 * only on identity-complete unsettled cards, and /build/custom seeds from the same loader.
 *
 * Run: npx tsx --test src/lib/picks/optimizer-card-identity.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeOptimizerSlips } from "../normalize.ts";
import { legKey } from "../slip/leg-identity.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p) => fs.readFileSync(path.join(APP, p), "utf8");

const FULL_LEG = {
  sport: "mlb", playerName: "Pete Alonso", marketLabel: "Hits", side: "Over", line: 0.5,
  playerId: 624413, team: "BAL", opponent: "STL", market: "batter_hits", oddsForSide: -233,
};

test("a decomposed artifact leg passes its identity through, under the canonical key", () => {
  const [card] = normalizeOptimizerSlips([{ slipId: "s1", profile: "conservative", sport: "mlb", legs: [FULL_LEG] }], { date: "2026-08-25" });
  const leg = card.legs[0];
  assert.ok(leg.slipLeg, "identity rides along");
  assert.equal(leg.slipLeg.player, "Pete Alonso");
  assert.equal(leg.slipLeg.americanOdds, -233);
  // The SAME selection added from the props board resolves to the SAME canonical key.
  const boardShaped = { sport: "mlb", player: "Pete Alonso", marketLabel: "Hits", side: "Over", line: 0.5, americanOdds: -230 };
  assert.equal(legKey(leg.slipLeg), legKey(boardShaped), "one identity across surfaces");
});

test("FAIL-CLOSED: any missing field means no slipLeg — never derived from the display label", () => {
  for (const drop of ["playerName", "marketLabel", "side"]) {
    const partial = { ...FULL_LEG };
    delete partial[drop];
    const [card] = normalizeOptimizerSlips([{ slipId: "s2", profile: "balanced", sport: "mlb", legs: [partial] }], { date: "2026-08-25" });
    if (!card) continue; // a leg without odds/label may drop the card entirely — also fail-closed
    assert.equal(card.legs[0]?.slipLeg, undefined, `missing ${drop} ⇒ no identity`);
  }
});

test("the card UI offers Customize only on identity-complete unsettled cards, and says why otherwise", () => {
  const src = read("src/components/ui/suggested-card.tsx");
  assert.match(src, /card\.legs\.every\(\(l\) => l\.slipLeg\)/, "eligibility = every leg carries identity");
  assert.match(src, /!card\.result \|\| card\.result === "pending"/, "settled cards are results — never customizable");
  assert.match(src, /\/build\/custom\?card=/, "Customize seeds the shared draft route");
  assert.match(src, /can&rsquo;t seed the custom draft/, "ineligible cards state the reason instead of a dead control");
});

test("the seed map consumes the same suggested-cards loader, identity-complete only (owner moved P210 R-B)", () => {
  // P210 moved seed-map composition to its one owner; the invariants travel with it.
  const lib = read("src/lib/parlays/seedable-cards.ts");
  assert.match(lib, /loadSuggestedCards\(ladderDate\)/, "same loader, same date frame");
  assert.match(lib, /card\.legs\.every\(\(l\) => l\.slipLeg\)/, "only identity-complete cards enter the seed map");
  const page = read("src/app/build/custom/page.tsx");
  assert.match(page, /buildSeedableCards\(/, "the page consumes the owner");
});
