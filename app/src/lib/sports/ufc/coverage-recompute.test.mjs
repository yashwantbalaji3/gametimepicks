/**
 * Session 9 · main-health — UFC coverage is recomputed from the CURRENT card + the STORED snapshot, free,
 * and never touches a price row. The published-snapshot guard (card-coverage.test LIVE ARTIFACT) stays strict.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ADDED_AFTER_CAPTURE, coverageReconciles, recomputeCoverageAgainstCard } from "./card-coverage.mjs";

const bout = (id) => ({ boutId: String(id), red: { name: `R${id}` }, blue: { name: `B${id}` }, weightClass: "LW", startUtc: "2026-10-04T02:00:00Z" });
const priced = (id) => ({ boutId: String(id), eventId: `ev-${id}`, joinMethod: "exact", red: { name: `R${id}`, american: -150 }, blue: { name: `B${id}`, american: 130 }, sides: 2 });
const card = (ids, extra = {}) => ({ generatedAt: "2026-10-02T18:17:58Z", event: { providerEventId: "600061182" }, bouts: ids.map(bout), ...extra });
/** A 13-bout capture: 11 priced, 2 join-failed — the real 10-01 shape. */
const snap13 = () => {
  const ids = Array.from({ length: 13 }, (_, i) => i + 1);
  return {
    generatedAt: "2026-10-01T17:13:14Z", event: { providerEventId: "600061182" },
    bouts: ids.slice(0, 11).map(priced),
    unpricedBouts: [12, 13].map((id) => ({ boutId: String(id), state: "JOIN_FAILED", reason: "r" })),
    coverage: { cardBouts: 13, priced: 11, marketNotOpen: 0, joinFailed: 2, unmatchedProviderEvents: 2 },
    oddsReady: false, partiallyPriced: true, blockers: ["2 bout(s) could not be joined to a provider event that exists — a defect, not a closed market"],
  };
};
const ids14 = Array.from({ length: 14 }, (_, i) => i + 1);

test("13-bout snapshot + current 14-bout card → coverage recomputes truthfully; the new bout is counted unpriced, never priced", () => {
  const r = recomputeCoverageAgainstCard({ snapshot: snap13(), card: card(ids14), nowIso: "2026-10-03T12:00:00Z" });
  assert.deepEqual(r.coverage, { cardBouts: 14, priced: 11, marketNotOpen: 0, joinFailed: 2, addedAfterCapture: 1, unmatchedProviderEvents: 2 });
  assert.ok(coverageReconciles(r.coverage));
  assert.equal(r.bouts.length, r.coverage.priced, "priced == price rows (the guard's own identity)");
  const added = r.unpricedBouts.find((u) => u.boutId === "14");
  assert.equal(added.state, ADDED_AFTER_CAPTURE);
  assert.equal(r.oddsReady, false);
  assert.ok(r.blockers.some((x) => /added to the card after the last price capture/.test(x)));
  assert.deepEqual(r.coverageRecomputed.providerCalls, 0);
});

test("a removed bout leaves the denominator; its price row moves byte-identical to droppedFromCard", () => {
  const remaining = ids14.filter((id) => id !== 3 && id !== 14).slice(0, 12); // bout 3 (priced) left the card
  const r = recomputeCoverageAgainstCard({ snapshot: snap13(), card: card(remaining) });
  assert.equal(r.coverage.cardBouts, 12);
  assert.equal(r.coverage.priced, 10);
  assert.ok(!r.bouts.some((b) => b.boutId === "3"));
  assert.deepEqual(r.droppedFromCard, [priced(3)]);
  assert.ok(coverageReconciles(r.coverage));
});

test("no stored odds → nothing is invented (no snapshot, or a snapshot with no rows, is truthful zero coverage)", () => {
  assert.equal(recomputeCoverageAgainstCard({ snapshot: null, card: card(ids14) }), null);
  const empty = { ...snap13(), bouts: [], unpricedBouts: [], coverage: { cardBouts: 0, priced: 0, marketNotOpen: 0, joinFailed: 0, unmatchedProviderEvents: 0 }, blockers: [] };
  const r = recomputeCoverageAgainstCard({ snapshot: empty, card: card([1, 2]) });
  assert.deepEqual([r.coverage.priced, r.coverage.addedAfterCapture, r.bouts.length, r.oddsReady, r.partiallyPriced], [0, 2, 0, false, false]);
  assert.ok(r.blockers.some((x) => /no h2h market/.test(x)));
});

test("the recompute never modifies a price row, and a different event or an unchanged universe is left alone", () => {
  const s = snap13();
  const frozen = JSON.stringify(s.bouts);
  const r = recomputeCoverageAgainstCard({ snapshot: s, card: card(ids14) });
  assert.equal(JSON.stringify(r.bouts), frozen, "every price row byte-identical");
  assert.equal(JSON.stringify(s.bouts), frozen, "the input snapshot is not mutated");
  assert.equal(recomputeCoverageAgainstCard({ snapshot: snap13(), card: card(ids14.slice(0, 13)) }), null, "same universe → nothing to do");
  assert.equal(recomputeCoverageAgainstCard({ snapshot: snap13(), card: { ...card(ids14), event: { providerEventId: "other" } } }), null, "a different card is not this snapshot's to recompute");
});

test("MUTATION PROBE · the old stale-denominator snapshot fails the published-snapshot identity; the recomputed one passes", () => {
  const c = card(ids14);
  const stale = snap13();                                     // the pre-fix state on main 2026-10-03
  const guard = (odds) => odds.coverage.cardBouts === c.bouts.length && coverageReconciles(odds.coverage) && odds.coverage.priced === odds.bouts.length;
  assert.equal(guard(stale), false, "the stale 13-of-14 denominator is caught");
  assert.equal(guard(recomputeCoverageAgainstCard({ snapshot: stale, card: c })), true, "recomputed coverage satisfies the same strict guard");
  // and a recompute that pretended the new bout was priced would break the price-row identity
  const cheat = recomputeCoverageAgainstCard({ snapshot: stale, card: c });
  cheat.coverage.priced += 1; cheat.coverage.addedAfterCapture -= 1;
  assert.equal(guard(cheat), false, "counting an uncaptured bout as priced is caught");
});

test("a recompute drops the false provider-hash mismatch an older capture carried (2026-10-05)", () => {
  // Captures from 2026-09-11 to 2026-10-05 compared the card's ESPN id with a per-fight provider hash and
  // wrote this blocker for a card they had in fact priced. The recompute only runs for the same ESPN event,
  // so there is no mismatch to carry — copying it forward re-published a verdict that was never true.
  const snapshot = { ...snap13(), blockers: ["the odds artifact describes event 4a469d6a287808bf75aa8a246197f51d, not this card (600061182) — no prices have been captured for it yet", ...snap13().blockers] };
  const r = recomputeCoverageAgainstCard({ snapshot, card: card(ids14) });
  assert.ok(!r.blockers.some((x) => /describes event/.test(x)), JSON.stringify(r.blockers));
  assert.equal(r.oddsReady, false, "still not ready: one bout unpriced, two join-failed");
  assert.equal(r.partiallyPriced, true);
});

test("a recompute never runs across ESPN events", () => {
  assert.equal(recomputeCoverageAgainstCard({ snapshot: snap13(), card: { ...card(ids14), event: { providerEventId: "600061541" } } }), null);
});
