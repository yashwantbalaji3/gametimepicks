/**
 * Suggested Parlays V2 (shadow) — the card rules, each probed. Run:
 *   npx tsx --test src/lib/products/engine-v2/suggested-parlays.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeReceiptV2, PROBABILITY_DETAIL, LEG_CLASS } from "./receipt.mjs";
import { evaluateReceiptV2 } from "./eligibility.mjs";
import { selectSuggestedParlaysV2, SP_POLICY_V2, SP_NO_CARD, spPolicyId, spPolicyIdOf } from "./suggested-parlays.mjs";
import { cardConflicts, cardMetrics, americanToDecimal, decimalToAmerican, PRICING_KIND } from "./cards.mjs";
import { getRiskBucketForCombinedOdds, PUBLIC_RISK_LABELS } from "../../parlays/risk-odds-bands.mjs";
import { buildShadowDay, gradeShadowDay, ledgerOf } from "../../../../scripts/products/suggested-parlays-shadow.mjs";

const AS_OF = "2026-10-03T14:00:00Z";
/* Two-way MLB markets for N games, priced like a real single-book slate (≈4.5% hold). */
function slate(n = 6) {
  const out = [];
  const prices = [[-180, 150], [-140, 120], [-120, 100], [-250, 205], [-110, -110], [-160, 135], [-300, 240], [-105, -115]];
  for (let g = 0; g < n; g += 1) {
    const [h, a] = prices[g % prices.length];
    const ph = 1 / americanToDecimal(h), pa = 1 / americanToDecimal(a), s = ph + pa;
    for (const [side, price, p] of [["home", h, ph / s], ["away", a, pa / s]]) {
      out.push(makeReceiptV2({ legClass: LEG_CLASS.TEAM, sport: "mlb", eventId: `g${g}`, eventStartUtc: `2026-10-03T${17 + g}:00:00Z`, teamId: side === "home" ? `h${g}` : `a${g}`, opponentId: side === "home" ? `a${g}` : `h${g}`, family: "team_result", marketKey: "mlb_moneyline", side, sportsbook: "draftkings", price, marketCapturedAt: "2026-10-03T12:00:00Z", marketImpliedProbability: p, probabilityDetail: PROBABILITY_DETAIL.MARKET_IMPLIED, settlementSupport: "PROVEN", selectionLabel: `${side}${g}` }));
    }
  }
  return out.filter((r) => evaluateReceiptV2(r, { asOf: AS_OF }).eligible);
}

test("tier names are the canonical public labels, in the canonical order", () => {
  const s = selectSuggestedParlaysV2(slate(), { asOf: AS_OF });
  assert.deepEqual(s.tiers.map((t) => t.label), ["low", "medium", "high", "longshot"].map((t) => PUBLIC_RISK_LABELS[t]));
  assert.match(s.policy, /^SP-V2@[0-9a-f]{12}$/);
});

test("every published card sits inside its own band, under its leg cap, one leg per event, legs disjoint across tiers", () => {
  const s = selectSuggestedParlaysV2(slate(8), { asOf: AS_OF });
  const seen = new Set();
  for (const t of s.tiers) {
    if (!t.card) continue;
    assert.equal(getRiskBucketForCombinedOdds(t.card.combinedAmerican), t.tier, `${t.tier} card ${t.card.combinedAmerican} outside its band`);
    assert.ok(t.card.legCount <= SP_POLICY_V2.tiers[t.tier].maxLegs && t.card.legCount >= 2);
    assert.equal(new Set(t.card.legs.map((l) => l.eventId)).size, t.card.legCount, "one leg per event");
    for (const l of t.card.legs) { assert.ok(!seen.has(l.receiptId), "a leg may appear on one tier only"); seen.add(l.receiptId); }
    if (SP_POLICY_V2.tiers[t.tier].minLegProbability != null) assert.ok(t.card.minLegProbability >= SP_POLICY_V2.tiers[t.tier].minLegProbability);
  }
});

test("pricing and probability are labelled truthfully: derived product, market-implied basis", () => {
  const s = selectSuggestedParlaysV2(slate(8), { asOf: AS_OF });
  const c = s.tiers.find((t) => t.card).card;
  assert.equal(c.pricingKind, PRICING_KIND.DERIVED_INDEPENDENT_PRODUCT);
  assert.equal(c.jointProbabilityBasis, "MARKET_IMPLIED");
  for (const l of c.legs) { assert.equal(l.probabilityKind, "MARKET_IMPLIED"); assert.match(l.reason, /not a GameTimePicks forecast/); }
});

test("deterministic: same receipts in any order → identical selection", () => {
  const a = selectSuggestedParlaysV2(slate(8), { asOf: AS_OF });
  const b = selectSuggestedParlaysV2(slate(8).reverse(), { asOf: AS_OF });
  assert.deepEqual(a.tiers.map((t) => t.card?.legs.map((l) => l.receiptId)), b.tiers.map((t) => t.card?.legs.map((l) => l.receiptId)));
});

test("no card is a typed result: no legs, one event, and a floor never lowered to fill a tier", () => {
  assert.ok(selectSuggestedParlaysV2([], { asOf: AS_OF }).tiers.every((t) => t.state === "NO_QUALIFYING_CARD" && t.reasonCode === SP_NO_CARD.NO_ELIGIBLE_LEGS));
  assert.ok(selectSuggestedParlaysV2(slate(1), { asOf: AS_OF }).tiers.every((t) => t.reasonCode === SP_NO_CARD.TOO_FEW_EVENTS));
});

test("same-event, same-entity and duplicate legs are card conflicts", () => {
  const s = slate(3);
  const [h0, a0, h1] = s;
  assert.deepEqual(cardConflicts([h0, a0]), ["SAME_ENTITY_CONFLICT", "SAME_EVENT_CONFLICT"]);
  assert.deepEqual(cardConflicts([h0, h0]), ["DUPLICATE_LEG", "SAME_ENTITY_CONFLICT", "SAME_EVENT_CONFLICT"]);
  assert.deepEqual(cardConflicts([h0, h1]), []);
});

test("a leg with no readable probability or no price never reaches a card (missing is not 0%)", () => {
  const legs = slate(4);
  const broken = makeReceiptV2({ ...legs[0], legClass: "TEAM", sport: "mlb", eventId: "gx", eventStartUtc: "2026-10-03T22:00:00Z", family: "team_result", side: "home", sportsbook: "draftkings", price: 500, marketCapturedAt: "2026-10-03T12:00:00Z", probabilityDetail: "MARKET_IMPLIED", marketImpliedProbability: null, settlementSupport: "PROVEN" });
  assert.equal(cardMetrics([legs[0], broken]), null);
  const s = selectSuggestedParlaysV2([...legs, broken], { asOf: AS_OF });
  for (const t of s.tiers) if (t.card) assert.ok(!t.card.legs.some((l) => l.eventId === "gx"));
});

test("price arithmetic round-trips", () => {
  for (const a of [-300, -110, 100, 150, 600]) assert.equal(decimalToAmerican(americanToDecimal(a)), a);
});

test("the policy hash moves when a bar moves (no silent constant edit)", () => {
  const clone = JSON.parse(JSON.stringify(SP_POLICY_V2));
  assert.equal(spPolicyIdOf(clone), spPolicyId);
  clone.tiers.medium.minLegProbability = 0.39;
  assert.notEqual(spPolicyIdOf(clone), spPolicyId);
});

test("V2's leg caps equal V1's published caps (build-risk-ladder BAND_MAX_LEGS)", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/parlays/build-risk-ladder.mjs"), "utf8");
  const m = /BAND_MAX_LEGS\s*=\s*\{([^}]*)\}/.exec(src);
  assert.ok(m, "V1 leg caps must stay declared in one place");
  for (const [t, spec] of Object.entries(SP_POLICY_V2.tiers)) assert.match(m[1], new RegExp(`${t}:\\s*${spec.maxLegs}\\b`));
});

test("shadow day: built only from a committed universe, graded only from finals, pending never a loss", () => {
  const legs = slate(6);
  const universe = { date: "2026-10-03", asOf: AS_OF, floor: { version: "leg-floor@2" }, counts: { eligible: legs.length, universeHash: "x" }, eligibleReceipts: legs };
  const day = buildShadowDay(universe);
  assert.match(day.status, /SHADOW/);
  const card = day.tiers.find((t) => t.card);
  assert.ok(card);
  assert.equal(gradeShadowDay(day, []), false, "no finals → nothing graded");
  assert.equal(card.graded, null);
  const finals = card.card.legs.map((l) => ({ gamePk: l.eventId, isFinal: true, homeRuns: l.side === "home" ? 5 : 1, awayRuns: l.side === "home" ? 1 : 5 }));
  assert.equal(gradeShadowDay(day, finals), true);
  assert.equal(card.graded.status, "won");
  const ledger = ledgerOf([day]);
  assert.equal(ledger.tiers[card.tier].won, 1);
  assert.match(ledger.note, /SHADOW/);
});

test("a tier's per-leg floor is never lowered to fill the tier", () => {
  /* Low takes C/D favourites; the ONLY Medium-band card left is A-away (+170, ~35%) × B-home (−300). */
  const mk = (eventId, side, price, p, h) => makeReceiptV2({ legClass: LEG_CLASS.TEAM, sport: "mlb", eventId, eventStartUtc: `2026-10-03T${h}:00:00Z`, teamId: `${eventId}-${side}`, opponentId: `${eventId}-${side === "home" ? "away" : "home"}`, family: "team_result", marketKey: "mlb_moneyline", side, sportsbook: "draftkings", price, marketCapturedAt: "2026-10-03T12:00:00Z", marketImpliedProbability: p, probabilityDetail: PROBABILITY_DETAIL.MARKET_IMPLIED, settlementSupport: "PROVEN" });
  const legs = [mk("A", "home", -205, 0.65, 18), mk("A", "away", 170, 0.35, 18), mk("B", "home", -300, 0.73, 19), mk("B", "away", 240, 0.27, 19), mk("C", "home", -400, 0.78, 20), mk("C", "away", 300, 0.22, 20), mk("D", "home", -400, 0.78, 21), mk("D", "away", 300, 0.22, 21)];
  const s = selectSuggestedParlaysV2(legs, { asOf: AS_OF });
  const medium = s.tiers.find((t) => t.tier === "medium");
  assert.equal(medium.card, null, "the only Medium card carries a 35% leg under a 40% floor — it must not publish");
  assert.equal(medium.state, "NO_QUALIFYING_CARD");
});
