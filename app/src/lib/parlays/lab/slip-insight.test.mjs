import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { cardChance, bandRecord, linkedPairs, shorterAlternative, recordTrade, impliedFromAmerican } from "./slip-insight.mjs";

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

/* ── P269 · the trade our own settled record can justify ─────────────────────────────────────────── */

const famRow = (o) => ({
  market: o.market, marketLabel: o.marketLabel, side: o.side ?? "Over", line: o.line ?? 0.5,
  label: `${o.side ?? "Over"} ${o.line ?? 0.5} ${o.marketLabel}`,
  decided: o.decided, wins: 0, losses: 0, cardUses: o.decided, hitRate: 0.5,
  impliedMean: 0.5, flatReturn: o.flatReturn, standardError: 0.02,
  sample: { id: o.decided >= 250 ? "substantial" : "accumulating", text: "caption" },
});
const REC = {
  since: "2026-05-22", until: "2026-09-11", distinct: 1093,
  families: [
    famRow({ market: "batter_total_bases", marketLabel: "Total Bases", line: 1.5, decided: 298, flatReturn: -0.145 }),
    famRow({ market: "batter_hits", marketLabel: "Hits", line: 0.5, decided: 365, flatReturn: -0.028 }),
    famRow({ market: "batter_rbis", marketLabel: "RBIs", line: 0.5, decided: 40, flatReturn: 0.22 }),
  ],
};
const cand = (o) => ({
  player: o.player, market: o.market, marketLabel: o.marketLabel, gameId: o.gameId ?? "g1",
  side: o.side ?? "Over", line: o.line ?? 0.5, americanOdds: o.odds,
  photoUrl: null, teamAbbr: null, opponentAbbr: null, matchup: "", leg: { id: `${o.player}:${o.market}` },
});

test("the record trade stays on the same player and the same game", () => {
  const draft = [{ ...leg({ player: "A", market: "batter_total_bases", line: 1.5, odds: 120 }), marketLabel: "Total Bases" }];
  const pool = [
    cand({ player: "A", market: "batter_hits", marketLabel: "Hits", line: 0.5, odds: -200 }),
    cand({ player: "B", market: "batter_hits", marketLabel: "Hits", line: 0.5, odds: -200 }),
    cand({ player: "A", market: "batter_hits", marketLabel: "Hits", line: 0.5, gameId: "g9", odds: -200 }),
  ];
  const t = recordTrade(pool, draft, REC);
  assert.equal(t.incoming.player, "A");
  assert.equal(t.incoming.gameId, "g1");
  assert.equal(t.from.marketLabel, "Total Bases");
  assert.equal(t.to.marketLabel, "Hits");
  assert.ok(Math.abs(t.gap - 0.117) < 1e-6, `gap: ${t.gap}`);
  assert.equal(t.beforeAmerican, 120, "a one-leg card is its own price");
  assert.equal(t.afterAmerican, -200, "and the trade reprices it");
});

test("a thin family is never the evidence for a trade, however good it looks", () => {
  /* RBIs shows +22% on forty legs. That is exactly the row a reader would act on and exactly the row
     that cannot carry a claim, so the sample floor keeps it out in both directions. */
  const draft = [{ ...leg({ player: "A", market: "batter_total_bases", line: 1.5, odds: 120 }), marketLabel: "Total Bases" }];
  const toThin = recordTrade([cand({ player: "A", market: "batter_rbis", marketLabel: "RBIs", odds: -150 })], draft, REC);
  assert.equal(toThin, null, "a forty-leg family cannot be the better kind");
  const fromThin = recordTrade(
    [cand({ player: "A", market: "batter_hits", marketLabel: "Hits", odds: -200 })],
    [{ ...leg({ player: "A", market: "batter_rbis", line: 0.5, odds: 120 }), marketLabel: "RBIs" }],
    REC,
  );
  assert.equal(fromThin, null, "and a forty-leg family cannot be the thing worth trading away");
});

test("a small gap is not a finding, and a leg already on the card is not an alternative", () => {
  const draft = [{ ...leg({ player: "A", market: "batter_total_bases", line: 1.5, odds: 120 }), marketLabel: "Total Bases" }];
  const pool = [cand({ player: "A", market: "batter_hits", marketLabel: "Hits", odds: -200 })];
  assert.equal(recordTrade(pool, draft, REC, { minGap: 0.2 }), null, "11.7 points is not 20");
  const both = [
    { ...leg({ player: "A", market: "batter_total_bases", line: 1.5, odds: 120 }), marketLabel: "Total Bases" },
    { ...leg({ player: "A", market: "batter_hits", line: 0.5, odds: -200 }), marketLabel: "Hits" },
  ];
  assert.equal(recordTrade(pool, both, REC), null, "the better kind is already on the card");
  assert.equal(recordTrade(pool, draft, null), null, "no record, no trade");
});

test("the trade never claims either family made money", () => {
  const src = fs.readFileSync(new URL("./slip-insight.mjs", import.meta.url), "utf8");
  const block = src.slice(src.indexOf("A DIFFERENT KIND OF LEG"));
  assert.match(block, /NEITHER family is presented as profitable/);
  assert.match(block, /offered, never applied/i);
  /* And the copy that renders it must not assert a direction both families happen to share today:
     one family is already above break-even, so a hardcoded "both lost money" would be false. */
  const ui = fs.readFileSync(new URL("../../../components/parlays/lab/slip-gauges.tsx", import.meta.url), "utf8");
  const rendered = [...ui.matchAll(/>([^<>{}]{8,})</g)].map((m) => m[1]).join(" ");
  assert.ok(!/both lost money/i.test(rendered), "the trade copy must be derived from the two numbers, not asserted");
  assert.match(ui, /returnPhrase|sample\.text/, "and it must carry each family's own sample caption");
});
