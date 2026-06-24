/**
 * Unit tests for the daily-portfolio SEED-MODEL settlement engine. All inputs here are SYNTHETIC fixtures
 * that exercise the grading + money RULES — they are not real results and are never written to any ledger.
 * Covers the four apply paths the brief required: won→advance (bankroll unchanged), lost→stop (−$100 seed),
 * void→drop (seed returned), not-final→refuse.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { gradeLaneCard, seedModelOutcome, parseLegId } from "./daily-portfolio-settle.ts";

const laneCard = (lane, step, stake, legs) => ({ lane, step, stake, combinedOdds: 139, legCount: legs.length, legs });
const leg = (eventId, market, sel, odds, matchup) => ({ id: `team:${eventId}:${market}:x`, matchup, market: "Match Result", selection: sel, odds, provider: "test", modelConfidence: 0.6, kickoffEt: "7:00 PM ET", risk: "Lower-volatility" });

const bundle = (finals, graded) => ({ date: "2026-01-01", settlementSource: "synthetic test fixture", finals, graded });
const gradedCard = (lane, stake, result, payout, legResults) => ({
  product: "bank-builder", card: `Lane ${lane} (stake $${stake})`, result, payout, stake,
  legs: legResults.map((r, i) => ({ market: "moneyline_90", selection: `S${i}`, odds: -150, result: r, reason: `synthetic ${r}` })),
});

test("parseLegId extracts eventId / marketType / side", () => {
  assert.deepEqual(parseLegId("team:47:moneyline_90:away"), { eventId: "47", marketType: "moneyline_90", side: "away" });
  assert.deepEqual(parseLegId("team:48:match_total_goals:under"), { eventId: "48", marketType: "match_total_goals", side: "under" });
  assert.deepEqual(parseLegId(undefined), { eventId: null, marketType: null, side: null });
});

test("gradeLaneCard WON: both games FT + graded won → status won, legs graded HIT, payout carried", () => {
  const card = laneCard("A", 4, 1464.71, [leg(47, "moneyline_90", "Croatia", -230, "Panama vs Croatia"), leg(48, "match_total_goals", "Under 2.5", -150, "Colombia vs DR Congo")]);
  const o = bundle(
    [{ matchId: 47, match: "Panama vs Croatia", homeGoals: 0, awayGoals: 1, status: "FT" }, { matchId: 48, match: "Colombia vs DR Congo", homeGoals: 1, awayGoals: 0, status: "FT" }],
    [gradedCard("A", 1464.71, "won", 3502.57, ["won", "won"])],
  );
  const p = gradeLaneCard(card, o);
  assert.equal(p.status, "won");
  assert.equal(p.payout, 3502.57);
  assert.equal(p.settledLegs.length, 2);
  assert.ok(p.settledLegs.every((l) => l.settlementStatus === "hit"), "both legs HIT");
  assert.match(p.settledLegs[0].settlement.official, /Panama 0-1 Croatia \(FT/, "official 90' result stamped");
});

test("gradeLaneCard LOST: card graded lost → status lost, legs MISS", () => {
  const card = laneCard("B", 2, 277.11, [leg(45, "btts", "No", -174, "Portugal vs Uzbekistan"), leg(46, "btts", "No", -164, "England vs Ghana")]);
  const o = bundle(
    [{ match: "Portugal vs Uzbekistan", homeGoals: 1, awayGoals: 1, status: "FT" }, { match: "England vs Ghana", homeGoals: 0, awayGoals: 0, status: "FT" }],
    [gradedCard("B", 277.11, "lost", 0, ["lost", "won"])],
  );
  const p = gradeLaneCard(card, o);
  assert.equal(p.status, "lost");
  assert.equal(p.payout, 0);
  assert.equal(p.settledLegs[0].settlementStatus, "miss");
});

test("gradeLaneCard VOID: card graded void → status void, legs marked void", () => {
  const card = laneCard("A", 4, 100, [leg(47, "moneyline_90", "Croatia", -230, "Panama vs Croatia"), leg(48, "match_total_goals", "Under 2.5", -150, "Colombia vs DR Congo")]);
  const o = bundle(
    [{ match: "Panama vs Croatia", homeGoals: 0, awayGoals: 1, status: "FT" }, { match: "Colombia vs DR Congo", homeGoals: 1, awayGoals: 0, status: "FT" }],
    [gradedCard("A", 100, "void", 100, ["void", "won"])],
  );
  const p = gradeLaneCard(card, o);
  assert.equal(p.status, "void");
  assert.equal(p.settledLegs[0].settlementStatus, "void");
});

test("gradeLaneCard NOT-FINAL: a leg's game is not FT → pending, no settled legs (no fake settlement)", () => {
  const card = laneCard("A", 4, 1464.71, [leg(47, "moneyline_90", "Croatia", -230, "Panama vs Croatia"), leg(48, "match_total_goals", "Under 2.5", -150, "Colombia vs DR Congo")]);
  const o = bundle(
    [{ match: "Panama vs Croatia", homeGoals: 0, awayGoals: 1, status: "FT" }, { match: "Colombia vs DR Congo", homeGoals: 0, awayGoals: 0, status: "1H" }],
    [gradedCard("A", 1464.71, "won", 3502.57, ["won", "won"])],
  );
  const p = gradeLaneCard(card, o);
  assert.equal(p.status, "pending");
  assert.equal(p.settledLegs.length, 0, "no settled legs produced for a non-final card");
});

test("gradeLaneCard MISSING graded card → pending (never invents a result)", () => {
  const card = laneCard("A", 4, 100, [leg(47, "moneyline_90", "Croatia", -230, "Panama vs Croatia")]);
  const o = bundle([{ match: "Panama vs Croatia", homeGoals: 0, awayGoals: 1, status: "FT" }], []); // no graded cards
  assert.equal(gradeLaneCard(card, o).status, "pending");
});

test("seedModelOutcome WON×2: record +2 wins, bankroll UNCHANGED (won steps roll)", () => {
  const out = seedModelOutcome({ record: { wins: 10, losses: 2, voids: 0, pending: 0 }, bankroll: 10176.17 },
    [{ status: "won" }, { status: "won" }]);
  assert.deepEqual(out.record, { wins: 12, losses: 2, voids: 0, pending: 0 });
  assert.equal(out.bankroll, 10176.17, "won steps never move the bankroll");
  assert.equal(out.wonCount, 2);
});

test("seedModelOutcome LOST: record +1 loss, bankroll −$100 SEED (only at-risk amount)", () => {
  const out = seedModelOutcome({ record: { wins: 10, losses: 2, voids: 0, pending: 0 }, bankroll: 10176.17 },
    [{ status: "lost" }]);
  assert.deepEqual(out.record, { wins: 10, losses: 3, voids: 0, pending: 0 });
  assert.equal(out.bankroll, 10076.17, "a lost step drops exactly the $100 seed");
  assert.equal(out.seedLost, 100);
});

test("seedModelOutcome VOID: seed returned — no record or bankroll change", () => {
  const out = seedModelOutcome({ record: { wins: 10, losses: 2, voids: 0, pending: 0 }, bankroll: 10176.17 },
    [{ status: "void" }]);
  assert.deepEqual(out.record, { wins: 10, losses: 2, voids: 1, pending: 0 });
  assert.equal(out.bankroll, 10176.17);
});

test("seedModelOutcome MIXED won+lost: wins+1, losses+1, bankroll −$100", () => {
  const out = seedModelOutcome({ record: { wins: 10, losses: 2, voids: 0, pending: 0 }, bankroll: 10176.17 },
    [{ status: "won" }, { status: "lost" }]);
  assert.deepEqual(out.record, { wins: 11, losses: 3, voids: 0, pending: 0 });
  assert.equal(out.bankroll, 10076.17);
});

test("seedModelOutcome REFUSES if any lane is pending (no partial settlement)", () => {
  assert.throws(() => seedModelOutcome({ record: { wins: 10, losses: 2, voids: 0, pending: 0 }, bankroll: 10176.17 },
    [{ status: "won" }, { status: "pending" }]), /refuse/);
});
