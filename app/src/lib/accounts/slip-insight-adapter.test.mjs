import test from "node:test";
import assert from "node:assert/strict";
import { readingToEngineLegs } from "./slip-insight-adapter.mjs";
import { cardChance, linkedPairs, bandRecord } from "@/lib/parlays/lab/slip-insight.mjs";

const leg = (o) => ({ player: "A", market: "Hits", side: "Over", line: 0.5, odds: -110, event: "NYY @ BOS", ...o });

test("an unpriced leg is dropped and counted, never guessed at", () => {
  const r = readingToEngineLegs([leg(), leg({ player: "B", odds: null }), leg({ player: "C", odds: 0 })]);
  assert.equal(r.legs.length, 1);
  assert.equal(r.droppedUnpriced, 2);
  assert.equal(readingToEngineLegs(null).legs.length, 0);
});

test("the event name becomes the game key, so the engine sees a same-game pair", () => {
  const same = readingToEngineLegs([leg({ player: "A" }), leg({ player: "B", market: "Total bases" })]);
  const pairs = linkedPairs(same.legs);
  assert.equal(pairs.length, 1);
  assert.match(pairs[0].reason, /not validated/, "a shared game is disclosed, never blocked");

  const apart = readingToEngineLegs([leg({ player: "A" }), leg({ player: "B", event: "LAD @ SF" })]);
  assert.deepEqual(linkedPairs(apart.legs), [], "different events are independent");
});

test("the reader's slip reads through the SAME chance and band maths as our own cards", () => {
  const { legs } = readingToEngineLegs([leg({ odds: 100 }), leg({ player: "B", event: "LAD @ SF", odds: 100 })]);
  const c = cardChance(legs);
  assert.equal(c.legs, 2);
  assert.equal(c.american, 300);
  assert.ok(Math.abs(c.impliedChance - 0.25) < 1e-9);
  // +300 is the top of the MEDIUM band (high starts above 300) — the boundary, asserted deliberately.
  const rec = bandRecord(c.american, { medium: { wins: 65, losses: 319, roi: -0.1065 } });
  assert.equal(rec.band, "medium");
  assert.equal(rec.decided, 384);
  assert.equal(bandRecord(c.american, { high: { wins: 48, losses: 336 } }), null, "no record for the band it fell in, no claim");
});

test("a leg with no event at all cannot be linked to anything", () => {
  const { legs } = readingToEngineLegs([leg({ event: null }), leg({ player: "B", event: null })]);
  assert.deepEqual(linkedPairs(legs), [], "unknown games must never be assumed to be the same game");
});
