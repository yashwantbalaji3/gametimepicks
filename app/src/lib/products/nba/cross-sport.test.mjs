/**
 * NBA × cross-sport handling. Run (from app/): npx tsx --test src/lib/products/nba/cross-sport.test.mjs
 * Every leg below is a TEST FIXTURE (invented ids, prices and instants).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { nbaLegFromEvaluation } from "./nba-leg.mjs";
import {
  CROSS_REASON, NBA_FAMILY_MARKET_KEY, PARLAY_CANDIDATE_V1_INPUT_FIELDS, cardWindow, checkCrossSportCard, dedupeMarkets,
  etProductDate, legWindow, toParlayCandidateInput, toSmartSlipRow,
} from "./cross-sport.mjs";
import { NBA_PRODUCT_FAMILIES } from "./nba-leg.mjs";
import { PERMISSIVE_REGISTRY, evaluate, permissiveSnapshot, verificationFor } from "./__fixtures__/permissive.mjs";

const fixtureLeg = () => {
  const s = permissiveSnapshot(); const e = evaluate(s);
  const r = nbaLegFromEvaluation({ evaluation: e, snapshot: s, verification: verificationFor(e), registry: PERMISSIVE_REGISTRY });
  assert.equal(r.ok, true);
  return { leg: r.leg, evaluation: e };
};

test("windows: an NBA tip and an NFL kickoff lock on the same 30-minute rule; a price expires at 12 h or the lock", () => {
  const nba = { sport: "nba", eventId: "N1", lockAt: "2026-11-02T00:00:00Z", capturedAt: "2026-11-01T20:00:00Z" };
  const nfl = { sport: "nfl", eventId: "F1", lockAt: "2026-11-01T18:00:00Z", capturedAt: "2026-11-01T10:00:00Z" };
  assert.equal(legWindow(nba).eventLockAt, "2026-11-01T23:30:00.000Z");
  assert.equal(legWindow(nba).expiresAt, "2026-11-01T23:30:00.000Z", "lock comes before the 12 h price expiry");
  assert.equal(legWindow(nfl).eventLockAt, "2026-11-01T17:30:00.000Z");
  assert.equal(legWindow({ ...nfl, capturedAt: "2026-11-01T04:00:00Z" }).expiresAt, "2026-11-01T16:00:00.000Z", "12 h price expiry before the lock");
  const w = cardWindow([nba, nfl]);
  assert.equal(w.activateBy, "2026-11-01T17:30:00.000Z", "a card activates before its EARLIEST leg lock");
  assert.equal(w.lastStartAt, "2026-11-02T00:00:00.000Z");
  assert.equal(cardWindow([nba, { sport: "mlb", eventId: "M1" }]).activateBy, null, "an unknown start fails closed");
});

test("product day: a 00:00Z tip belongs to the previous ET evening; mixed product days refuse", () => {
  assert.equal(etProductDate("2026-11-02T00:00:00Z"), "2026-11-01");
  const a = { sport: "nba", eventId: "N1", providerAthleteId: "1", family: "pts", line: 20.5, side: "OVER", lockAt: "2026-11-02T00:00:00Z", capturedAt: "2026-11-01T15:00:00Z" };
  const b = { sport: "mlb", eventId: "M1", team: "NYY", family: "moneyline", side: "home", lockAt: "2026-11-01T23:05:00Z", capturedAt: "2026-11-01T15:00:00Z" };
  const c = { sport: "nfl", eventId: "F1", team: "KC", family: "moneyline", side: "home", lockAt: "2026-11-02T18:00:00Z", capturedAt: "2026-11-02T08:00:00Z" };
  assert.equal(checkCrossSportCard([a, b], { now: "2026-11-01T16:00:00Z" }).ok, true);
  const mixed = checkCrossSportCard([a, c], { now: "2026-11-01T16:00:00Z" });
  assert.ok(mixed.reasons.some((r) => r.code === CROSS_REASON.MIXED_PRODUCT_DAYS));
  assert.ok(checkCrossSportCard([a, b], { now: "2026-11-01T22:40:00Z" }).reasons.some((r) => r.code === CROSS_REASON.EXPIRED), "inside the MLB leg's cutoff the whole card is expired");
});

test("same game: two NBA props in one game never share a card (different players, or PTS + PRA of one player)", () => {
  const base = { sport: "nba", eventId: "N1", lockAt: "2026-11-02T00:00:00Z", capturedAt: "2026-11-01T15:00:00Z" };
  const p1 = { ...base, providerAthleteId: "1", family: "pts", line: 20.5, side: "OVER" };
  const p2 = { ...base, providerAthleteId: "2", family: "reb", line: 8.5, side: "UNDER" };
  const p1pra = { ...base, providerAthleteId: "1", family: "pra", line: 33.5, side: "OVER" };
  for (const pair of [[p1, p2], [p1, p1pra]]) {
    const r = checkCrossSportCard(pair, { now: "2026-11-01T16:00:00Z" });
    assert.equal(r.ok, false);
    assert.ok(r.reasons.some((x) => x.code === CROSS_REASON.SAME_EVENT));
  }
  const nflSameId = { sport: "nfl", eventId: "N1", team: "KC", family: "moneyline", side: "home", lockAt: "2026-11-01T18:00:00Z", capturedAt: "2026-11-01T10:00:00Z" };
  assert.ok(!checkCrossSportCard([p1, nflSameId], { now: "2026-11-01T16:00:00Z" }).reasons.some((x) => x.code === CROSS_REASON.SAME_EVENT), "event keys are per sport");
});

test("duplicate markets across books: one market; conflicting leans refuse; the representative is never chosen by price", () => {
  const m = { sport: "nba", eventId: "N1", providerAthleteId: "1", family: "pts", line: 20.5, side: "OVER", lockAt: "2026-11-02T00:00:00Z" };
  const dk = { ...m, book: "draftkings", capturedAt: "2026-11-01T15:00:00Z", price: { sideAmerican: -110 } };
  const fd = { ...m, book: "fanduel", capturedAt: "2026-11-01T15:00:00Z", price: { sideAmerican: 150 } };
  const mgmNewer = { ...m, book: "betmgm", capturedAt: "2026-11-01T15:05:00Z", price: { sideAmerican: -200 } };
  const d = dedupeMarkets([fd, dk]);
  assert.equal(d.kept.length, 1);
  assert.equal(d.kept[0].book, "draftkings", "tie on capture → book key ascending, not the longer price");
  assert.deepEqual(d.alternates, [{ marketKey: d.alternates[0].marketKey, kept: "draftkings", alternates: ["fanduel"] }]);
  assert.equal(dedupeMarkets([dk, fd, mgmNewer]).kept[0].book, "betmgm", "newest capture first, whatever its price");
  const conflict = dedupeMarkets([dk, { ...fd, side: "UNDER" }]);
  assert.equal(conflict.kept.length, 0);
  assert.equal(conflict.refused[0].reason, CROSS_REASON.DUPLICATE_MARKET_LEAN_CONFLICT);
  assert.ok(checkCrossSportCard([dk, fd], { now: "2026-11-01T16:00:00Z" }).reasons.some((r) => r.code === CROSS_REASON.DUPLICATE_MARKET));
});

test("#1141 mapping: an NBA leg fills exactly the fields gtp.parlay.candidate@1's toCandidate reads, numbers verbatim", () => {
  const { leg, evaluation } = fixtureLeg();
  const c = toParlayCandidateInput(leg);
  assert.deepEqual(Object.keys(c).sort(), [...PARLAY_CANDIDATE_V1_INPUT_FIELDS].sort());
  assert.ok(Object.is(c.modelProbability, evaluation.pOver), "OVER lean → the evaluator's pOver, verbatim");
  assert.equal(c.price, leg.price.sideAmerican);
  assert.equal(c.market, "player_points");
  assert.equal(c.side, "over");
  assert.equal(c.sport, "nba");
  assert.equal(c.startUtc, leg.lockAt);
  assert.match(c.modelId, /@/, "model@version, split by toCandidate's parseModelId");
  assert.ok(c.receipts.includes(`snapshot:${leg.snapshotId}`) && c.receipts.includes(`evaluation:${leg.evaluator.identityKey}`));
  for (const f of NBA_PRODUCT_FAMILIES) assert.ok(NBA_FAMILY_MARKET_KEY[f], `${f} has a market key`);
  assert.equal(NBA_FAMILY_MARKET_KEY.minutes, undefined);
});

test("Smart Betslip: compare-only row — operator name, price, capture time; no link, prefill unsupported", () => {
  const { leg } = fixtureLeg();
  const row = toSmartSlipRow(leg);
  assert.equal(row.book, "DraftKings");
  assert.deepEqual(row.handoff, { status: "HANDOFF_NOT_AVAILABLE", link: null, prefill: "UNSUPPORTED" });
  assert.equal(row.price, leg.price.sideAmerican);
});
