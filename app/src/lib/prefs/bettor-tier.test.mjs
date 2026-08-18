import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tierForBankroll, risksForTier, BETTOR_TIERS } from "./bettor-tier.ts";

const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

test("tiers resolve from the stated daily bankroll", () => {
  assert.equal(tierForBankroll(25)?.id, "bronze");
  assert.equal(tierForBankroll(49.99)?.id, "bronze");
  assert.equal(tierForBankroll(50)?.id, "silver");
  assert.equal(tierForBankroll(99)?.id, "silver");
  assert.equal(tierForBankroll(100)?.id, "gold");
  assert.equal(tierForBankroll(249)?.id, "gold");
  assert.equal(tierForBankroll(250)?.id, "diamond");
  assert.equal(tierForBankroll(100_000)?.id, "diamond");
  assert.equal(tierForBankroll(null), null, "no bankroll, no tier");
  assert.equal(tierForBankroll(0), null, "zero is not a tier");
});

test("the bands are contiguous and leave no gap", () => {
  for (let i = 1; i < BETTOR_TIERS.length; i++) {
    assert.equal(BETTOR_TIERS[i].minBankroll, BETTOR_TIERS[i - 1].maxBankroll,
      "each tier starts exactly where the previous one ends");
  }
  assert.equal(BETTOR_TIERS[BETTOR_TIERS.length - 1].maxBankroll, null, "the top tier is unbounded");
});

test("a bankroll changes HOW MANY cards — never their length", () => {
  /*
   * Length belongs to the band, measured within each: medium 3 legs +1.7% vs 4 legs −31.3%; high
   * 4 legs +6.0% vs 5 legs −41.4%; longshot 5 legs −7.0% vs 6 legs −76.2%. Handing a bigger
   * bankroll longer cards would be selling variance as a privilege.
   */
  const src = read("src/lib/prefs/bettor-tier.ts");
  assert.doesNotMatch(src, /maxLegs|legCap|legs:\s*\d/, "no tier carries a leg count");
  const ladder = read("scripts/parlays/build-risk-ladder.mjs");
  assert.match(ladder, /BAND_MAX_LEGS/, "the leg cap is per BAND");
  assert.doesNotMatch(ladder, /BETTOR_TIER[S]?\s*\[[^\]]*\]\.maxLegs/, "and never per bettor tier");
});

test("the calmest card comes first, so the smallest bankroll never leads with the wildest", () => {
  // Low risk hits 41.1%; longshot hits 4.7%. A tier shown ONE card must be shown the low one.
  assert.deepEqual(risksForTier({ id: "bronze", minBankroll: 0, maxBankroll: 50, cardsPerDay: 1 }), ["low"]);
  assert.deepEqual(risksForTier({ id: "silver", minBankroll: 50, maxBankroll: 100, cardsPerDay: 2 }), ["low", "medium"]);
  assert.deepEqual(
    risksForTier({ id: "diamond", minBankroll: 250, maxBankroll: null, cardsPerDay: 4 }),
    ["low", "medium", "high", "longshot"],
  );
});

test("no stated bankroll hides nothing", () => {
  assert.equal(risksForTier(null).length, 4, "without a bankroll every band stays visible");
});

test("the tier is INTERNAL — no surface names it", () => {
  /*
   * A visible ladder of metal names turns a bankroll into a status and gives a reader a reason to
   * inflate the number they type. On a stream whose every band is negative that is the last
   * incentive worth building.
   */
  for (const rel of [
    "src/components/parlays/parlay-lab-entry.tsx",
    "src/components/parlays/risk-ladder-board.tsx",
  ]) {
    const prose = read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const metal of ["Bronze", "Silver", "Gold", "Diamond"]) {
      assert.doesNotMatch(prose, new RegExp(`["'>\\s]${metal}\\b`),
        `${rel} must not display the tier name "${metal}"`);
    }
  }
});
