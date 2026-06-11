import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFinalsCards, FINALS_TIER_ORDER } from "./nba-finals-cards.ts";

function leg(name, market, side, odds, score = 1, extra = {}) {
  return {
    leanId: `${name}-${market}-${side}`, playerId: 1, playerName: name, team: "NY",
    opponent: "SA", market, marketLabel: null, side, line: 1.5, projection: 2,
    edgePct: 5, confidence: "High", bookmaker: "dk", oddsForSide: odds, legScore: score, ...extra,
  };
}

test("distinct players per card; no exact-set dupes", () => {
  const legs = [leg("A", "PTS", "Over", -130), leg("B", "REB", "Over", -120),
                leg("C", "AST", "Over", 120), leg("D", "3PM", "Over", 140)];
  const out = buildFinalsCards(legs, { perTier: 5 });
  for (const t of FINALS_TIER_ORDER) {
    for (const card of out[t]) {
      const names = card.legs.map((l) => l.playerName);
      assert.equal(new Set(names).size, names.length, "distinct players");
      assert.equal(card.sameGame, true);
      assert.ok(card.correlationNote.includes("Single-game"));
    }
  }
  const allIds = FINALS_TIER_ORDER.flatMap((t) => out[t].map((c) => c.cardId));
  assert.equal(new Set(allIds).size, allIds.length, "no duplicate cards across tiers");
});

test("tiers are odds-ordered (low < medium < high < longshot combined odds)", () => {
  const legs = [leg("A","PTS","Over",-200),leg("B","REB","Over",-150),leg("C","AST","Over",110),
                leg("D","3PM","Over",130),leg("E","PTS","Over",150),leg("F","REB","Over",160)];
  const out = buildFinalsCards(legs, { perTier: 5 });
  const avg = (cs) => cs.length ? cs.reduce((s,c)=>s+c.combinedAmerican,0)/cs.length : null;
  if (out.low.length && out.medium.length) assert.ok(avg(out.low) < avg(out.medium));
  if (out.medium.length && out.high.length) assert.ok(avg(out.medium) < avg(out.high));
});

test("safer tiers cap volatile BLK/STL legs at one", () => {
  const legs = [leg("A","BLK","Over",-130),leg("B","STL","Over",-120),leg("C","PTS","Over",-110)];
  const out = buildFinalsCards(legs, { perTier: 5 });
  for (const t of ["low","medium"]) {
    for (const card of out[t]) assert.ok(card.volatileLegCount <= 1, `${t} card has >1 volatile`);
  }
});

test("anomaly legs are excluded", () => {
  const legs = [leg("A","PTS","Over",-130),leg("B","REB","Over",-120,1,{isAnomaly:true})];
  const out = buildFinalsCards(legs, { perTier: 5 });
  const names = FINALS_TIER_ORDER.flatMap((t)=>out[t].flatMap((c)=>c.legs.map((l)=>l.playerName)));
  assert.ok(!names.includes("B"), "anomaly leg B must not appear");
});
