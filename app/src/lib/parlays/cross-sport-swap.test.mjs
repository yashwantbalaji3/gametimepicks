/**
 * §14 — A REPLACEMENT MUST BE FROM THE SAME SPORT.
 *
 * `benchFor` matched on the market LABEL alone and `SwapCandidate` carried no sport at all, so any
 * two sports sharing a label ("Total", "Moneyline", "Shots") could offer each other's players as
 * substitutes. `leg-swap-panel` even accepted a `sport` prop and never passed it to the filter.
 *
 * Synthetic fixtures on purpose: the /build pool is EMPTY today (0 eligible legs), so no live
 * collision is demonstrable and a data-driven test would prove nothing and rot. These guards are
 * preventative, and say so.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { benchFor } from "./leg-swap.ts";

const C = (sport, player, market, gameId, americanOdds) => ({
  sport, player, market, marketLabel: market, gameId, americanOdds,
  side: "Over", line: 1.5, teamAbbr: null, opponentAbbr: null, matchup: "",
});
const T = (sport, player, market, gameId, americanOdds) => ({ sport, player, market, gameId, americanOdds });

test("a shared market label across sports does NOT make a candidate eligible", () => {
  const pool = [
    C("mlb", "MLB Bat", "Total", "g-mlb", -120),
    C("soccer", "EPL Wing", "Total", "g-epl", -118),
  ];
  const bench = benchFor(pool, T("soccer", "EPL Striker", "Total", "g-other", -115), []);
  assert.deepEqual(bench.map((c) => c.player), ["EPL Wing"], "only the same sport may be offered");
  assert.ok(!bench.some((c) => c.sport === "mlb"), "an MLB prop is not a soccer replacement");
});

test("the same-sport bench still works — the constraint narrows, it must not empty", () => {
  const pool = [
    C("mlb", "A", "Hits", "g1", -130),
    C("mlb", "B", "Hits", "g2", -125),
    C("nfl", "C", "Hits", "g3", -128),
  ];
  const bench = benchFor(pool, T("mlb", "Target", "Hits", "g9", -127), []);
  assert.deepEqual(bench.map((c) => c.player).sort(), ["A", "B"]);
});

test("a target with NO sport is refused outright — not given a free pass", () => {
  /* The untyped .mjs boundary means TypeScript cannot force a sport on every candidate. With a plain
     equality filter, `undefined === undefined` is TRUE and the constraint silently no-ops on exactly
     the path that needed it. An empty bench is the safe failure. */
  const pool = [C("mlb", "A", "Hits", "g1", -130)];
  assert.deepEqual(benchFor(pool, { player: "T", market: "Hits", gameId: "g9", americanOdds: -127 }, []), []);
  assert.deepEqual(benchFor(pool, T("", "T", "Hits", "g9", -127), []), []);

  /* ⚠ THE CASE THE REFUSAL ACTUALLY EXISTS FOR, and the one this test first missed. With a sported
     pool, plain equality already excludes a sportless target, so the assertions above passed even
     with the refusal deleted. The hole is a sportless target AND a sportless candidate: undefined
     equals undefined, and the bench opens. */
  const sportless = [{ player: "Ghost", market: "Hits", marketLabel: "Hits", gameId: "g1", americanOdds: -130, side: "Over", line: 1.5, teamAbbr: null, opponentAbbr: null, matchup: "" }];
  assert.deepEqual(
    benchFor(sportless, { player: "T", market: "Hits", gameId: "g9", americanOdds: -127 }, []),
    [],
    "two unknowns must not match each other",
  );
});

test("a candidate with no sport is never offered, even to a sported target", () => {
  const pool = [
    { player: "NoSport", market: "Hits", marketLabel: "Hits", gameId: "g1", americanOdds: -130, side: "Over", line: 1.5, teamAbbr: null, opponentAbbr: null, matchup: "" },
    C("mlb", "Sported", "Hits", "g2", -129),
  ];
  const bench = benchFor(pool, T("mlb", "T", "Hits", "g9", -127), []);
  assert.deepEqual(bench.map((c) => c.player), ["Sported"]);
});

test("the earlier constraints are untouched: same game and same player are still excluded", () => {
  const onCard = [T("mlb", "OnCard", "Hits", "g-used", -120)];
  const pool = [
    C("mlb", "OnCard", "Hits", "g-free", -126),   // same player
    C("mlb", "SameGame", "Hits", "g-used", -127), // game already on the card
    C("mlb", "Fine", "Hits", "g-new", -128),
  ];
  const bench = benchFor(pool, T("mlb", "Target", "Hits", "g-target", -127), onCard);
  assert.deepEqual(bench.map((c) => c.player), ["Fine"]);
});

test("every SwapCandidate producer declares a sport", () => {
  /* A producer that omits it would hand `benchFor` a candidate that can never be offered — the
     feature would quietly stop working rather than break loudly. */
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  for (const rel of ["lib/mlb/mlb-props.ts", "components/parlays/risk-ladder-board.tsx", "components/parlays/lab/slip-gauges.tsx"]) {
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    assert.match(src, /sport: (String\(l\.sport\)|"mlb")/, `${rel} must declare a sport on its swap candidates`);
  }
});

test("shorterAlternative passes the sport through — the constraint must narrow, not disable", async () => {
  /*
   * ⚠ THE FIRST VERSION OF THIS FIX BROKE THE FEATURE, and only an existing test caught it.
   * `shorterAlternative` rebuilt the target field-by-field and dropped the sport, so `benchFor`
   * refused every bench and the stand-in silently vanished. A constraint that disables the thing it
   * was meant to constrain is worse than the defect — so the pass-through is pinned here.
   */
  const { shorterAlternative } = await import("./lab/slip-insight.mjs");
  const leg = (player, gameId, odds) => ({
    id: player, sport: "mlb", player, gameId, market: "batter_hits",
    side: "Over", line: 0.5, americanOdds: odds, riskTier: "low",
  });
  const pool = [
    { sport: "mlb", player: "Nearer", market: "batter_hits", gameId: "g3", americanOdds: 250, marketLabel: "Hits", side: "Over", line: 0.5, photoUrl: null, teamAbbr: null, opponentAbbr: null, matchup: "" },
    { sport: "soccer", player: "Wrong Sport", market: "batter_hits", gameId: "g5", americanOdds: 260, marketLabel: "Hits", side: "Over", line: 0.5, photoUrl: null, teamAbbr: null, opponentAbbr: null, matchup: "" },
  ];
  const alt = shorterAlternative(pool, [leg("Long", "g1", 400), leg("Short", "g2", -150)]);
  assert.ok(alt, "a same-sport stand-in must still be offered");
  assert.equal(alt.incoming.player, "Nearer");
  assert.notEqual(alt.incoming.player, "Wrong Sport", "and the cross-sport candidate is not it");
});
