/**
 * Canonical draft-leg identity guards (P208 · Release A).
 *
 * The defect this locks out: the slip key used to include `matchup`, a display string the risk
 * ladder and the props board composed DIFFERENTLY for the same selection — so one pick added from
 * two surfaces became two draft legs. Identity now depends only on the fields every surface agrees
 * on, normalised. These tests assert the rule with each surface's real field conventions, so a
 * call-site drifting back to surface-specific vocabulary fails here rather than as a duplicate on
 * a reader's card.
 *
 * Run: npx tsx --test src/lib/slip/leg-identity.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { legKey, migrateSlipLegs } from "./leg-identity.ts";

test("one selection has one key across the three real surfaces' conventions", () => {
  // The risk ladder's AddToSlip mapping (matchup was the opponent abbreviation).
  const ladder = { sport: "mlb", player: "Shay Whitcomb", marketLabel: "Hits", side: "Under", line: 0.5, americanOdds: 115, matchup: "CIN" };
  // The props board's mapping (matchup was the full label; side capitalised).
  const props = { sport: "mlb", player: "Shay Whitcomb", marketLabel: "Hits", side: "Under", line: 0.5, americanOdds: 118, matchup: "SF @ CIN" };
  // The engine pool's slipLeg (side lowercase in the engine's own vocabulary).
  const engine = { sport: "mlb", player: "Shay Whitcomb", marketLabel: "Hits", side: "under", line: 0.5, americanOdds: 115, matchup: "SF vs CIN" };
  assert.equal(legKey(ladder), legKey(props));
  assert.equal(legKey(ladder), legKey(engine));
});

test("identity distinguishes what actually differs", () => {
  const base = { sport: "mlb", player: "Steven Kwan", marketLabel: "Hits", side: "Over", line: 0.5 };
  assert.notEqual(legKey(base), legKey({ ...base, side: "Under" }));
  assert.notEqual(legKey(base), legKey({ ...base, line: 1.5 }));
  assert.notEqual(legKey(base), legKey({ ...base, marketLabel: "Total Bases" }));
  assert.notEqual(legKey(base), legKey({ ...base, player: "Jo Adell" }));
  assert.notEqual(legKey(base), legKey({ ...base, sport: "nba" }));
});

test("null line is a stable empty segment, distinct from zero", () => {
  const noLine = { sport: "ufc", player: "Rei Tsuruya", marketLabel: "Fight winner", side: "Win", line: null };
  assert.equal(legKey(noLine), legKey({ ...noLine }));
  assert.notEqual(legKey(noLine), legKey({ ...noLine, line: 0 }));
});

test("migration re-keys stored legs and merges old-key duplicates, keeping the first and its stake", () => {
  const a = { key: "mlb|CIN|Shay Whitcomb|Hits|Under|0.5", sport: "mlb", player: "Shay Whitcomb", marketLabel: "Hits", side: "Under", line: 0.5, americanOdds: 115 };
  const b = { key: "mlb|SF @ CIN|Shay Whitcomb|Hits|Under|0.5", sport: "mlb", player: "Shay Whitcomb", marketLabel: "Hits", side: "Under", line: 0.5, americanOdds: 118 };
  const c = { key: "old|other", sport: "mlb", player: "Jo Adell", marketLabel: "Hits", side: "Over", line: 0.5, americanOdds: -120 };
  const { legs, stakes } = migrateSlipLegs([a, b, c], { [a.key]: 25, [b.key]: 50, [c.key]: 10 });
  assert.equal(legs.length, 2);
  assert.equal(legs[0].americanOdds, 115); // first occurrence wins
  assert.equal(legs[0].key, legKey(a));
  assert.equal(legs[1].key, legKey(c));
  assert.deepEqual(stakes, { [legKey(a)]: 25, [legKey(c)]: 10 });
});

test("already-canonical state passes through unchanged", () => {
  const leg = { sport: "mlb", player: "Steven Kwan", marketLabel: "Hits", side: "Over", line: 0.5, americanOdds: -130 };
  const keyed = { ...leg, key: legKey(leg) };
  const { legs, stakes } = migrateSlipLegs([keyed], { [keyed.key]: 15 });
  assert.deepEqual(legs, [keyed]);
  assert.deepEqual(stakes, { [keyed.key]: 15 });
});
