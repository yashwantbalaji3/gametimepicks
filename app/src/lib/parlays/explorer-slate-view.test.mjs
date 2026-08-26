/**
 * EXPLORER SLATE VIEW guards (P211 · Release 0) — capability parity for the payload dedupe.
 *
 * Cards ship ordered legIds; ONE legs-by-id index (eligibleLegs + extraLegs) resolves them. These
 * prove, on synthetic slates: resolution reproduces every card's exact leg sequence; a card leg
 * absent from eligibleLegs rides ONCE in extraLegs (fail-open, never dropped, never duplicated);
 * group order/membership and every non-leg card field are byte-identical.
 *
 * Run: npx tsx --test src/lib/parlays/explorer-slate-view.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { explorerSlateView } from "./ui-loader.ts";

const leg = (id, extra = {}) => ({ legId: id, sport: "MLB", sportKey: "mlb", market: "Hits", side: "over", participant: `P${id}`, team: null, opponent: null, line: 0.5, odds: -120, modelProbability: 0.6, marketImpliedProbability: 0.55, edge: 2, confidenceTier: "B", riskScore: 1, riskTier: "Low", legQualityTier: "A", legQualityScore: 9, survivalScore: 90, topPositiveFactors: ["f1"], topNegativeFactors: [], missingFlags: [], staleFlags: [], smallSampleFlags: [], leakagePassed: true, identity: {}, ...extra });

const card = (id, legs) => ({ parlayId: id, sport: "MLB", sportKey: "mlb", riskLevel: "low", parlayType: "cross_game", legs, combinedOdds: 150, estimatedHitProbability: 0.4, payoutMultiple: 2.5, averageLegQuality: 9, confidenceTier: "B", riskTier: "Low", correlationScore: 0, correlationSummary: "none" });

function slate({ eligible, cards, gameCards = [] }) {
  return {
    date: "2026-08-26", available: true, sports: [],
    suggestedBySportRisk: { MLB: { low: cards } },
    mixedByRisk: { low: cards.slice(0, 1) },
    allSuggested: cards,
    gameSpecific: gameCards.length ? [{ gameId: "g1", sport: "MLB", label: "G", parlays: gameCards }] : [],
    eligibleLegs: eligible,
    bankBuilderPreview: { laneA: null, laneB: null },
    oddsBandDiagnostics: { legsDroppedTooShort: 0, legsDroppedTooLong: 0, cardsRebucketed: 0, cardsDroppedOutOfBucket: 0 },
  };
}

const resolve = (view, c) => {
  const byId = new Map([...view.eligibleLegs, ...view.extraLegs].map((l) => [l.legId, l]));
  return c.legIds.map((id) => byId.get(id)).filter(Boolean);
};

test("resolution reproduces every card's exact leg sequence, in order", () => {
  const l1 = leg("a"), l2 = leg("b"), l3 = leg("c");
  const s = slate({ eligible: [l1, l2, l3], cards: [card("c1", [l2, l1]), card("c2", [l3, l2, l1])] });
  const v = explorerSlateView(s);
  for (const [i, orig] of s.allSuggested.entries()) {
    const got = resolve(v, v.allSuggested[i]);
    assert.deepEqual(got.map((l) => l.legId), orig.legs.map((l) => l.legId), `card ${orig.parlayId} order`);
    assert.deepEqual(got, orig.legs, `card ${orig.parlayId} exact objects`);
  }
  assert.equal(v.extraLegs.length, 0, "everything indexed — no extras needed");
});

test("a card leg missing from eligibleLegs rides ONCE in extraLegs — fail-open, never dropped or duplicated", () => {
  const known = leg("a"), orphan = leg("zz", { participant: "Orphan" });
  const s = slate({ eligible: [known], cards: [card("c1", [known, orphan]), card("c2", [orphan])] });
  const v = explorerSlateView(s);
  assert.equal(v.extraLegs.length, 1, "the orphan serializes exactly once");
  assert.equal(v.extraLegs[0].legId, "zz");
  assert.deepEqual(resolve(v, v.allSuggested[0]).map((l) => l.legId), ["a", "zz"]);
  assert.deepEqual(resolve(v, v.allSuggested[1]).map((l) => l.legId), ["zz"]);
});

test("group order/membership and every non-leg card field survive byte-identically", () => {
  const l1 = leg("a");
  const c1 = card("c1", [l1]);
  const s = slate({ eligible: [l1], cards: [c1], gameCards: [card("g1c", [l1])] });
  const v = explorerSlateView(s);
  const { legs: _l, ...origRest } = c1;
  const { legIds, ...viewRest } = v.allSuggested[0];
  assert.deepEqual(viewRest, origRest, "non-leg fields untouched");
  assert.deepEqual(legIds, ["a"]);
  assert.equal(v.gameSpecific[0].parlays[0].legIds[0], "a");
  assert.equal(v.mixedByRisk.low[0].parlayId, "c1");
});
