/**
 * Suggested Parlays V2 · F-1 — ONE card-leg rule: a card with any leg from a family the coverage registry demotes to
 * market context is withheld (counted, families named) by every producer and surface that shows cards.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { marketContextFamilies, legIsMarketContext, partitionByLegEligibility, priceIsFresh, loadCommittedCoverage, PRICE_MAX_AGE_DAYS, marketContextReason } from "./card-leg-eligibility.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const src = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const coverage = { markets: [{ sport: "mlb", market: "player_props", demotedFamilies: ["batter_hits", "batter_total_bases"] }, { sport: "mlb", market: "moneyline", demotedFamilies: [] }] };
const fam = marketContextFamilies(coverage);
const leg = (market, sport = "MLB", marketLabel = market) => ({ market, sport, marketLabel });

test("🔴 a demoted family is market context; any such leg withholds the whole card, counted and named", () => {
  assert.equal(legIsMarketContext(leg("batter_hits"), fam), true);
  assert.equal(legIsMarketContext(leg("moneyline"), fam), false);
  assert.equal(legIsMarketContext({ market: "batter_hits" }, fam, "mlb"), true, "a leg without a sport takes the card's");
  assert.equal(legIsMarketContext(leg("batter_hits", "NFL"), fam), false, "families are per sport");
  const { eligible, withheld, withheldFamilies } = partitionByLegEligibility([
    { slipId: "a", legs: [leg("moneyline"), leg("moneyline")] },
    { slipId: "b", legs: [leg("moneyline"), leg("batter_hits", "MLB", "Hits")] },
  ], fam);
  assert.deepEqual(eligible.map((s) => s.slipId), ["a"]);
  assert.deepEqual(withheld.map((s) => s.slipId), ["b"]);
  assert.deepEqual(withheldFamilies, ["Hits"]);
  assert.match(marketContextReason(["Hits"]), /market-context family \(Hits\).*not a published GameTime projection/);
});

test("price freshness is ONE rule: at most PRICE_MAX_AGE_DAYS; unreadable is never fresh", () => {
  assert.equal(PRICE_MAX_AGE_DAYS, 3);
  assert.equal(priceIsFresh("2031-10-01T12:00:00Z", "2031-10-04T12:00:00Z"), true);
  assert.equal(priceIsFresh("2031-10-01T12:00:00Z", "2031-10-04T12:00:01Z"), false);
  assert.equal(priceIsFresh(null, "2031-10-04T12:00:00Z"), false);
  assert.match(src("scripts/parlays/lab-eligibility.mjs"), /import \{ PRICE_MAX_AGE_DAYS \} from "..\/..\/src\/lib\/parlays\/card-leg-eligibility\.mjs"/, "the lab reads the same constant");
});

test("positive control: the committed coverage projection really demotes MLB batter hits (else every guard here is vacuous)", () => {
  const f = marketContextFamilies(loadCommittedCoverage(REPO));
  assert.ok(f.has("MLB:batter_hits"), `families: ${[...f].join(", ")}`);
});

test("🔴 every producer and surface that shows cards applies the ONE rule", () => {
  const ladder = src("scripts/parlays/build-risk-ladder.mjs");
  assert.match(ladder, /partitionByLegEligibility\(poolByTier\[tier\], families, "MLB"\)/, "the ladder gates before scoring");
  assert.ok(ladder.indexOf("partitionByLegEligibility(poolByTier") < ladder.indexOf("const ranked = "), "gate precedes ranking");
  assert.match(ladder, /poolByTier\[tier\] = eligible;/, "and the gated pool is the one scored (a called-but-ignored gate is no gate)");
  assert.match(src("src/app/build/page.tsx"), /\.filter\(\(p\) => !legIsMarketContext\(\{ sport: "MLB", market: p\.market \}, marketContext\)\)/, "the swap bench obeys it");
  assert.match(src("scripts/ask/build-ask-projections.mjs"), /legIsMarketContext\(l, marketContext, cut\)/, "Ask's projection withholds at write");
  assert.match(src("src/lib/ask/tools/forecast.mjs"), /legIsMarketContext\(l, demoted\)/, "and Ask's tool at read, through the same owner");
});

/* Adopted with this rule. A ladder built before it can still carry market-context cards until the next daily run. */
const ADOPTED = "2026-09-30T00:00:00Z";
test("LIVE · no published ladder card built under the rule carries a market-context leg", (t) => {
  const doc = JSON.parse(fs.readFileSync(path.join(APP, "public/data/parlays/risk-ladder/latest.json"), "utf8"));
  if (Date.parse(doc.generatedAt) < Date.parse(ADOPTED)) { t.skip(`latest ladder was built ${doc.generatedAt}, before the rule (${ADOPTED}) — announced, not checked`); return; }
  const f = marketContextFamilies(loadCommittedCoverage(REPO));
  for (const c of doc.cards ?? []) for (const l of c.legs ?? []) assert.ok(!legIsMarketContext({ ...l, sport: "MLB" }, f), `${c.slipId}: ${l.market} is market context`);
  assert.ok(doc.eligibility, "a ladder built under the rule declares what it withheld");
});
