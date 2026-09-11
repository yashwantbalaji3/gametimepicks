import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { cardChance, bandRecord, linkedPairs, shorterAlternative, impliedFromAmerican } from "./slip-insight.mjs";

const leg = (o) => ({ id: o.player, sport: "mlb", player: o.player, gameId: o.gameId ?? "g1", market: o.market ?? "batter_hits", side: o.side ?? "Over", line: o.line ?? 0.5, americanOdds: o.odds, riskTier: "low" });

test("the card's chance is what its combined price implies, and it names the weakest leg", () => {
  const c = cardChance([leg({ player: "A", odds: -198 }), leg({ player: "B", gameId: "g2", odds: -146 })]);
  assert.equal(c.legs, 2);
  assert.ok(Math.abs(c.decimal - 1.505 * 1.6849) < 1e-3);
  assert.ok(Math.abs(c.impliedChance - 1 / c.decimal) < 1e-12);
  assert.ok(Math.abs(c.weakestLegChance - impliedFromAmerican(-146)) < 1e-12, "the longest-priced leg is the least likely");
  assert.equal(cardChance([]), null);
});

test("the band record is the lab's published cards at this price — never the built card's own", () => {
  const byTier = { medium: { wins: 65, losses: 319, roi: -0.1065 }, longshot: { wins: 0, losses: 0 } };
  const r = bandRecord(154, byTier);
  assert.equal(r.band, "medium");
  assert.equal(r.decided, 384);
  assert.ok(Math.abs(r.hitRate - 0.1693) < 1e-3);
  assert.equal(bandRecord(2000, byTier), null, "a band with nothing decided reports nothing, not 0%");
  assert.equal(bandRecord(154, null), null);
});

test("linked pairs are named with the engine's reason, provable conflicts first", () => {
  const pairs = linkedPairs([
    leg({ player: "A", gameId: "g1", odds: -110 }),
    leg({ player: "B", gameId: "g1", market: "batter_total_bases", odds: 120 }),
    leg({ player: "A", gameId: "g1", odds: -110 }),
  ]);
  assert.ok(pairs.length >= 2);
  assert.equal(pairs[0].hardDisable, true, "the duplicate sorts above the disclosure");
  assert.match(pairs[0].reason, /cannot be added twice/);
  const sameGame = pairs.find((p) => !p.hardDisable);
  assert.match(sameGame.reason, /not validated/, "a shared game is disclosed, never blocked");
  assert.deepEqual(linkedPairs([leg({ player: "A", gameId: "g1", odds: -110 }), leg({ player: "B", gameId: "g2", odds: -110 })]), []);
});

test("the alternative is shorter-priced, from the published pool, and reprices the whole card", () => {
  const draft = [leg({ player: "Long", gameId: "g1", odds: 400 }), leg({ player: "Short", gameId: "g2", odds: -150 })];
  const pool = [
    { player: "Nearer", market: "batter_hits", gameId: "g3", americanOdds: 250, marketLabel: "Hits", side: "Over", line: 0.5, photoUrl: null, teamAbbr: null, opponentAbbr: null, matchup: "" },
    { player: "Longer", market: "batter_hits", gameId: "g4", americanOdds: 600, marketLabel: "Hits", side: "Over", line: 0.5, photoUrl: null, teamAbbr: null, opponentAbbr: null, matchup: "" },
  ];
  const s = shorterAlternative(pool, draft);
  assert.equal(s.outgoing.player, "Long", "the longest-priced leg is the one offered a stand-in");
  assert.equal(s.incoming.player, "Nearer", "and the stand-in is shorter-priced, not the longest on the board");
  assert.ok(s.afterChance > s.beforeChance, "a shorter price implies a higher chance");
  assert.ok(s.afterAmerican < s.beforeAmerican, "and a smaller payout — a trade, not an improvement");
  assert.equal(shorterAlternative(pool, [draft[0]]), null, "a single leg has nothing to trade");
  assert.equal(shorterAlternative([], draft), null);
});

test("no model probability, no advice, no projection", () => {
  const src = fs.readFileSync(new URL("./slip-insight.mjs", import.meta.url), "utf8");
  for (const banned of [/modelProb/i, /\bedge\b/i, /recommend/i, /expected value/i, /Math\.random/]) assert.doesNotMatch(src, banned);
  assert.match(src, /includes the sportsbook's margin/, "the implied chance is labelled");
});
