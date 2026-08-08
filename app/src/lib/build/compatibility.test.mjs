/**
 * Build compatibility guards (Program 144 · Release F).
 *
 * The engine's promise is "provable-only": hard-disable exactly what the leg data proves is
 * incompatible, disclose what it cannot prove, and invent nothing. Every boundary here is a way a
 * future edit could quietly break that promise in either direction — blocking too much (killing
 * legitimate cards) or too little (letting a guaranteed-loss pair through).
 *
 * Run: npx tsx --test src/lib/build/compatibility.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { classifyPair, classifyAgainstSelection, cardHealth, RELATIONS, COMPAT_RULES_VERSION } from "./compatibility.mjs";

const leg = (over = {}) => ({
  id: "mlb:1:total:over", sport: "mlb", gameId: 101, label: "Over 8.5", market: "total",
  marketLabel: "Total", riskTier: "Medium", americanOdds: -110, ...over,
});

test("a duplicate is hard-disabled with a plain-language reason", () => {
  const r = classifyPair(leg(), leg());
  assert.equal(r.relation, RELATIONS.DUPLICATE);
  assert.equal(r.hardDisable, true);
  assert.match(r.reason, /cannot be added twice/);
});

test("THE GUARANTEED LOSS · Over vs Under on the same total is provably exclusive", () => {
  const r = classifyPair(leg(), leg({ id: "mlb:1:total:under", label: "Under 8.5" }));
  assert.equal(r.relation, RELATIONS.OPPOSITE_SIDES);
  assert.equal(r.hardDisable, true);
  assert.match(r.reason, /at most one of these can win/);
});

test("different lines in the same total market still compete — hard-disabled as same-market", () => {
  const r = classifyPair(leg(), leg({ id: "x", label: "Over 9.5" }));
  assert.equal(r.relation, RELATIONS.SAME_GAME_SAME_MARKET);
  assert.equal(r.hardDisable, true);
});

test("same game, DIFFERENT market is disclosed, never blocked — correlation is not validated here", () => {
  const r = classifyPair(leg(), leg({ id: "mlb:1:ml:hou", label: "HOU ML", market: "moneyline" }));
  assert.equal(r.relation, RELATIONS.SAME_GAME);
  assert.equal(r.hardDisable, false, "an unproven correlation must not hard-block");
  assert.match(r.reason, /not validated/, "the disclosure must say the correlation is unvalidated");
  // And it must never pretend to quantify it.
  assert.doesNotMatch(r.reason, /\d+%|coefficient|weakens/, "no invented numbers, no 'weakens the parlay'");
});

test("legs from different games are independent with no reason attached", () => {
  const r = classifyPair(leg(), leg({ id: "y", gameId: 202 }));
  assert.equal(r.relation, RELATIONS.INDEPENDENT);
  assert.equal(r.reason, null);
});

test("cross-sport identical gameIds never collide — the game key includes the sport", () => {
  const r = classifyPair(leg(), leg({ id: "z", sport: "nba", gameId: 101, market: "total", label: "Over 210.5" }));
  assert.equal(r.relation, RELATIONS.INDEPENDENT, "gameId 101 in MLB and NBA are different games");
});

test("a null gameId can never create a same-game relation", () => {
  const r = classifyPair(leg({ gameId: null }), leg({ id: "w", gameId: null }));
  assert.equal(r.relation, RELATIONS.INDEPENDENT, "unknown games must not be assumed to be the same game");
});

test("against a whole selection, the MOST severe relation wins", () => {
  const selection = [leg({ id: "a", gameId: 500, market: "moneyline", label: "HOU ML" }), leg()];
  const r = classifyAgainstSelection(leg(), selection);   // duplicates selection[1]
  assert.equal(r.relation, RELATIONS.DUPLICATE);
});

test("card health reports structure it can prove and nothing it cannot", () => {
  const h = cardHealth([
    leg(),                                                              // game 101 total
    leg({ id: "b", market: "moneyline", label: "HOU ML" }),             // game 101 — unknown correlation
    leg({ id: "c", gameId: 202, riskTier: "High", label: "Over 7.5" }), // independent
  ]);
  assert.equal(h.rulesVersion, COMPAT_RULES_VERSION);
  assert.equal(h.legs, 3);
  assert.equal(h.games, 2);
  assert.equal(h.maxLegsInOneGame, 2);
  assert.equal(h.concentrated, true);
  assert.equal(h.hardConflicts, 0);
  assert.equal(h.unknownCorrelationPairs, 1);
  assert.deepEqual(h.tierMix, { Medium: 2, High: 1 });
  // No field pretends to be a quality score.
  assert.ok(!("score" in h) && !("grade" in h), "card health is structural fact, not an invented grade");
});

test("the module documents WHY there is no grade — the blocker is the missing model inputs", () => {
  // A future edit adding an odds-derived "grade" would violate the brief (payout-attractiveness
  // grading). The module contract says grades wait for model probability on the leg.
  const src = fs.readFileSync(new URL("./compatibility.mjs", import.meta.url), "utf8");
  assert.match(src, /WHY THERE IS NO GRADE/, "the blocker must be documented in the module");
  assert.match(src, /grading from odds alone is grading by\s+\* payout attractiveness/i);
});
