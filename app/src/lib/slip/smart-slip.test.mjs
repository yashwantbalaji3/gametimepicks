/**
 * Smart Betslip (compare-only MVP). Run: npx tsx --test src/lib/slip/smart-slip.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SMART_SLIP_STORAGE_KEY, SMART_SLIP_MAX_LEGS, SLIP_STATE, FRESHNESS, PRICE_NOT_VERIFIED,
  HANDOFF_NOT_AVAILABLE, HANDOFF_ROADMAP_NOTE,
  emptySlip, slipFromCard, addLeg, removeLeg, reorderLeg, freshnessBand, slipView, snapshotIdFor,
  parseSlip, readSlip, writeSlip, smartLegKey,
} from "./smart-slip.mjs";
import { injectedEligible } from "../parlays/v2/__fixtures__/v2-fixtures.mjs";

const NOW_MS = Date.parse("2026-10-19T18:00:00.000Z");
const ago = (ms) => new Date(NOW_MS - ms).toISOString();
const MIN = 60_000, HOUR = 60 * MIN;

const L = (i, o = {}) => ({ sport: "mlb", eventId: `ev${i}`, game: `G${i}`, market: "pitcher_outs", selection: `P${i} Over`, line: 15.5, book: "DraftKings", price: -110 - i, capturedAt: ago(5 * MIN), ...o });
const cardOf = (legs) => ({ cardId: "c1", legs });
const view = (slip, o = {}) => slipView(slip, { nowMs: NOW_MS, isVerifiedOperator: injectedEligible, ...o });

test("prefilled from a card: snapshot current, prices shown as recorded with a combined price", () => {
  const s = slipFromCard(cardOf([L(1), L(2, { price: 120, book: "FanDuel" })]));
  assert.equal(s.version, 2);
  assert.equal(s.pricingSnapshotId, snapshotIdFor(s.legs));
  const v = view(s);
  assert.equal(v.state, SLIP_STATE.PRICED_AS_RECORDED);
  assert.equal(v.legs[0].priceText, "−111");
  assert.equal(v.legs[0].bookText, "DraftKings");
  assert.equal(v.combinedPriceText.startsWith("+"), true);
  assert.equal(v.sameGame, false);
});

test("add / remove / reorder each invalidate the snapshot → PRICE_CHANGED_REVERIFY", () => {
  const s = slipFromCard(cardOf([L(1), L(2), L(3)]));
  const added = addLeg(s, L(4));
  assert.equal(added.pricingSnapshotId, null);
  assert.equal(added.invalidatedBy, "add");
  assert.equal(view(added).state, SLIP_STATE.PRICE_CHANGED_REVERIFY);
  assert.equal(view(added).combinedPriceText, "Combined price unavailable");

  const removed = removeLeg(s, s.legs[1].key);
  assert.deepEqual(removed.legs.map((l) => l.eventId), ["ev1", "ev3"]);
  assert.equal(view(removed).state, SLIP_STATE.PRICE_CHANGED_REVERIFY);
  assert.equal(removed.invalidatedBy, "remove");

  const moved = reorderLeg(s, 0, 2);
  assert.deepEqual(moved.legs.map((l) => l.eventId), ["ev2", "ev3", "ev1"]);
  assert.equal(view(moved).state, SLIP_STATE.PRICE_CHANGED_REVERIFY);
  assert.equal(moved.invalidatedBy, "reorder");
});

test("no-op mutations change nothing (duplicate add, unknown remove, same-place move)", () => {
  const s = slipFromCard(cardOf([L(1), L(2)]));
  assert.equal(addLeg(s, L(1)), s);
  assert.equal(removeLeg(s, "nope"), s);
  assert.equal(reorderLeg(s, 1, 1), s);
  assert.equal(reorderLeg(s, 5, 0), s);
  assert.equal(view(s).state, SLIP_STATE.PRICED_AS_RECORDED);
});

test("a stored slip whose legs no longer hash to its snapshot is PRICE_CHANGED_REVERIFY", () => {
  const s = slipFromCard(cardOf([L(1), L(2)]));
  const tampered = { ...s, legs: s.legs.map((l, i) => (i === 0 ? { ...l, price: -140 } : l)) };
  assert.equal(view(tampered).state, SLIP_STATE.PRICE_CHANGED_REVERIFY);
});

test("freshness bands: FRESH ≤ 15 min · AGING ≤ 6 h · EXPIRED > 6 h · UNKNOWN when undated or future", () => {
  assert.equal(freshnessBand(ago(15 * MIN), NOW_MS), FRESHNESS.FRESH);
  assert.equal(freshnessBand(ago(15 * MIN + 1), NOW_MS), FRESHNESS.AGING);
  assert.equal(freshnessBand(ago(6 * HOUR), NOW_MS), FRESHNESS.AGING);
  assert.equal(freshnessBand(ago(6 * HOUR + 1), NOW_MS), FRESHNESS.EXPIRED);
  assert.equal(freshnessBand(null, NOW_MS), FRESHNESS.UNKNOWN);
  assert.equal(freshnessBand("garbage", NOW_MS), FRESHNESS.UNKNOWN);
  assert.equal(freshnessBand(ago(-10 * MIN), NOW_MS), FRESHNESS.UNKNOWN);
});

test("an expired price is hidden as 'Price not verified', with its book; the slip says so", () => {
  const s = slipFromCard(cardOf([L(1, { capturedAt: ago(7 * HOUR) }), L(2, { capturedAt: ago(1 * HOUR) })]));
  const v = view(s);
  assert.equal(v.legs[0].freshness, FRESHNESS.EXPIRED);
  assert.equal(v.legs[0].priceText, PRICE_NOT_VERIFIED);
  assert.equal(v.legs[0].bookText, null);
  assert.equal(v.legs[0].hiddenBecause, "freshness");
  assert.equal(v.legs[1].freshness, FRESHNESS.AGING);
  assert.equal(v.legs[1].priceVisible, true);
  assert.equal(v.state, SLIP_STATE.PRICE_NOT_VERIFIED);
  assert.equal(v.combinedPriceText, "Combined price unavailable");
});

test("the production operator seam (closed until PR #1130) hides every price and book", () => {
  const s = slipFromCard(cardOf([L(1), L(2)]));
  const v = slipView(s, { nowMs: NOW_MS });
  assert.equal(v.state, SLIP_STATE.PRICE_NOT_VERIFIED);
  for (const l of v.legs) { assert.equal(l.priceText, PRICE_NOT_VERIFIED); assert.equal(l.bookText, null); assert.equal(l.hiddenBecause, "operator"); }
});

test("an offshore book's price is never shown, even fresh", () => {
  const s = slipFromCard(cardOf([L(1, { book: "BetOnline.ag" }), L(2)]));
  const v = view(s);
  assert.equal(v.legs[0].priceText, PRICE_NOT_VERIFIED);
  assert.equal(JSON.stringify(v).toLowerCase().includes("betonline"), false);
});

test("same-game legs are detected and the combined price is withheld", () => {
  const s = slipFromCard(cardOf([L(1, { eventId: "g" }), L(2, { eventId: "g" })]));
  const v = view(s);
  assert.equal(v.sameGame, true);
  assert.match(v.sameGameNote, /same game/);
  assert.equal(v.combinedPriceText, "Combined price unavailable");
  assert.equal(v.combinedAmerican, null);
});

test("handoff is a constant, never a link; the roadmap note names SB-L2's prerequisites", () => {
  const v = view(slipFromCard(cardOf([L(1), L(2)])));
  assert.equal(v.handoff.status, HANDOFF_NOT_AVAILABLE);
  assert.equal(v.handoff.roadmap, HANDOFF_ROADMAP_NOTE);
  assert.match(HANDOFF_ROADMAP_NOTE, /SB-L2 verified operator prefill — requires operator docs, book IDs, legal\/Terms review/);
  assert.equal(/https?:\/\//.test(JSON.stringify(v)), false, "no URL anywhere in the slip view");
});

test("empty slip, leg cap, dedupe by identity", () => {
  assert.equal(view(emptySlip()).state, SLIP_STATE.EMPTY);
  let s = emptySlip();
  for (let i = 0; i < SMART_SLIP_MAX_LEGS + 3; i++) s = addLeg(s, L(i));
  assert.equal(s.legs.length, SMART_SLIP_MAX_LEGS);
  assert.equal(smartLegKey(L(1)), smartLegKey({ ...L(1), price: 999, book: "x" }), "identity ignores price and book");
});

test("storage: key gtp.slip.v2 only; gtp.slip.v1 untouched; malformed or throwing storage ⇒ empty slip", () => {
  const mem = new Map([["gtp.slip.v1", '{"legs":[],"stakes":{}}']]);
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const s = slipFromCard(cardOf([L(1), L(2)]));
  assert.equal(writeSlip(storage, s), true);
  assert.equal(SMART_SLIP_STORAGE_KEY, "gtp.slip.v2");
  assert.equal(mem.get("gtp.slip.v1"), '{"legs":[],"stakes":{}}');
  assert.deepEqual(readSlip(storage), s);
  assert.equal(view(readSlip(storage)).state, SLIP_STATE.PRICED_AS_RECORDED, "a round-trip keeps the snapshot valid");

  const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); } };
  assert.deepEqual(readSlip(throwing), emptySlip());
  assert.equal(writeSlip(throwing, s), false);
  for (const raw of [null, "", "{", "[]", '{"version":1,"legs":[]}', '{"version":2,"legs":"x"}']) assert.deepEqual(parseSlip(raw), emptySlip(), String(raw));
});
