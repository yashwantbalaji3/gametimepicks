import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CANDIDATE_STATE as S, SETTLEMENT_SUPPORT as SS,
  PRODUCT_CLEARED_FAMILY_STATES, ROLE_CONFIRMED_PARTICIPATION,
  evaluateCandidate, foldUniverse,
} from "./candidate-universe.mjs";

const ASOF = "2026-09-26T23:23:23Z";
const H12 = 12 * 3_600_000;

/** A candidate that passes EVERY gate, so each test can break exactly one. */
const ok = (over = {}) => ({
  sport: "nfl", eventId: "nfl-401872953", participantId: "nfl-athlete-1", participant: "A Player",
  marketFamily: "player_rush_yds", familyState: "PUBLISHED", binary: false,
  line: 69.5, price: -110, sportsbook: "draftkings", marketCapturedAt: "2026-09-26T16:49:46Z",
  modelProjection: 38.02, modelProbability: 0.41, probabilityBasis: "PUBLISHED",
  participation: "AVAILABLE_ROLE_CONFIRMED", settlementSupport: SS.PROVEN, ...over,
});
const ev = (c) => evaluateCandidate(c, { asOf: ASOF, maxPriceAgeMs: H12 });

test("the fully-satisfied candidate is ELIGIBLE — otherwise every test below is vacuous", () => {
  const r = ev(ok());
  assert.equal(r.eligible, true, `expected eligible, got ${JSON.stringify(r.states)}`);
  assert.deepEqual(r.states, [S.ELIGIBLE]);
  assert.equal(r.primaryState, S.ELIGIBLE);
});

/* ── THE FINDING: role, not plumbing ────────────────────────────────────────────────────────── */

test("🔴 AVAILABLE_ROLE_UNCERTAIN fails ROLE, despite containing the word AVAILABLE", () => {
  /*
   * This is the binding constraint on the whole Sunday slate: all 280 NFL players are
   * AVAILABLE_ROLE_UNCERTAIN (264) or QUESTIONABLE (16). Not one has a confirmed role. A gate that
   * substring-matched "AVAILABLE" would have passed 264 of them.
   */
  const r = ev(ok({ participation: "AVAILABLE_ROLE_UNCERTAIN" }));
  assert.equal(r.eligible, false);
  assert.ok(r.states.includes(S.INELIGIBLE_ROLE));
  assert.ok(!r.states.includes(S.INELIGIBLE_AVAILABILITY), "the player IS available; only the role is unknown");
});

test("availability outranks role — a player who may not play is not merely 'role uncertain'", () => {
  const r = ev(ok({ participation: "QUESTIONABLE" }));
  assert.ok(r.states.includes(S.INELIGIBLE_AVAILABILITY));
  assert.equal(r.primaryState, S.INELIGIBLE_AVAILABILITY);
});

test("role is an ALLOWLIST — an unknown participation string must not pass", () => {
  /* A blocklist admits every state nobody thought of. */
  for (const p of ["PROBABLE", "ACTIVE", "EXPECTED", "LIKELY_STARTER", "", null, "AVAILABLE"]) {
    const r = ev(ok({ participation: p }));
    assert.equal(r.eligible, false, `participation ${JSON.stringify(p)} slipped through`);
  }
  for (const p of ROLE_CONFIRMED_PARTICIPATION) assert.equal(ev(ok({ participation: p })).eligible, true, p);
});

/* ── MODEL STATUS ───────────────────────────────────────────────────────────────────────────── */

test("family state is an ALLOWLIST — below-bar states appear in no blocklist anywhere", () => {
  /* ESTIMATE_BELOW_BAR and ROLE_UNCERTAIN are the two real NFL family states that a blocklist of
     STOP/REJECTED/PAUSED/HOLDING would have admitted. */
  for (const st of ["ESTIMATE_BELOW_BAR", "ROLE_UNCERTAIN", "ESTIMATE", "EXPERIMENTAL_LEAN",
                    "PUBLIC_EXPERIMENTAL", "REJECTED", "STOP", "PAUSED", "HOLDING", "UNEVALUATED", "", null]) {
    const r = ev(ok({ familyState: st }));
    assert.ok(r.states.includes(S.INELIGIBLE_MODEL_STATUS), `familyState ${JSON.stringify(st)} was admitted`);
  }
  for (const st of PRODUCT_CLEARED_FAMILY_STATES) {
    assert.ok(!ev(ok({ familyState: st })).states.includes(S.INELIGIBLE_MODEL_STATUS), st);
  }
});

/* ── PROBABILITY ────────────────────────────────────────────────────────────────────────────── */

test("a DISTRIBUTION is not a probability, and a market price is not a substitute", () => {
  /* The NFL families publish mean/p10..p90. P(over line) needs a distributional assumption, which is
     a gated modelling step — so a projection alone fails rather than acquiring a probability. */
  const distOnly = ev(ok({ modelProbability: null, probabilityBasis: null, modelProjection: 38.02 }));
  assert.ok(distOnly.states.includes(S.INELIGIBLE_NO_MODEL_PROBABILITY));

  /* And an implied probability from the book must not rescue it. */
  const implied = ev(ok({ modelProbability: null, marketImpliedProbability: 0.52 }));
  assert.ok(implied.states.includes(S.INELIGIBLE_NO_MODEL_PROBABILITY),
    "market-implied probability is explicitly not a GameTimePicks model probability");
});

/* ── MARKET / FRESHNESS ─────────────────────────────────────────────────────────────────────── */

test("a numeric market needs a line AND a price; a binary one needs only a price", () => {
  assert.ok(ev(ok({ line: null })).states.includes(S.INELIGIBLE_MARKET));
  assert.ok(ev(ok({ price: null })).states.includes(S.INELIGIBLE_MARKET));
  /* anytime_td has no line by nature — requiring one would reject it for the wrong reason. */
  const td = ev(ok({ marketFamily: "anytime_td", binary: true, line: null, price: 250 }));
  assert.ok(!td.states.includes(S.INELIGIBLE_MARKET), "a binary market must not be failed for having no line");
});

test("a price older than the bound is stale; a missing capturedAt is also stale, not fresh", () => {
  assert.ok(ev(ok({ marketCapturedAt: "2026-09-25T00:00:00Z" })).states.includes(S.INELIGIBLE_FRESHNESS));
  assert.ok(ev(ok({ marketCapturedAt: null })).states.includes(S.INELIGIBLE_FRESHNESS));
  assert.ok(ev(ok({ marketCapturedAt: "not-a-date" })).states.includes(S.INELIGIBLE_FRESHNESS));
});

test("an unpriced row is not ALSO reported stale — one gap, one reason", () => {
  /* Otherwise every market gap doubles as a freshness gap and the counts stop meaning anything. */
  const r = ev(ok({ line: null, price: null, marketCapturedAt: null }));
  assert.ok(r.states.includes(S.INELIGIBLE_MARKET));
  assert.ok(!r.states.includes(S.INELIGIBLE_FRESHNESS));
});

/* ── SETTLEMENT TRI-STATE ───────────────────────────────────────────────────────────────────── */

test("SCHEDULED_UNPROVEN still blocks — but is distinguishable from UNSUPPORTED", () => {
  /* The settler is armed in two workflows with --write and has never graded a prop. "One slate away"
     and "not built" must not report as the same problem. */
  const scheduled = ev(ok({ settlementSupport: SS.SCHEDULED_UNPROVEN }));
  const unsupported = ev(ok({ settlementSupport: SS.UNSUPPORTED }));
  for (const r of [scheduled, unsupported]) assert.ok(r.states.includes(S.INELIGIBLE_SETTLEMENT));
  assert.notEqual(scheduled.settlementSupport, unsupported.settlementSupport);
  assert.equal(ev(ok({ settlementSupport: SS.PROVEN })).eligible, true);
  /* An absent value must not read as supported. */
  assert.ok(ev(ok({ settlementSupport: undefined })).states.includes(S.INELIGIBLE_SETTLEMENT));
});

/* ── REPORTING SHAPE ────────────────────────────────────────────────────────────────────────── */

test("EVERY failing gate is reported, not just the first", () => {
  /* A first-fail report makes a leg look one fix from eligible when it is four — which is exactly
     the question being decided about NFL. */
  const r = ev(ok({ familyState: "ESTIMATE_BELOW_BAR", participation: "AVAILABLE_ROLE_UNCERTAIN", modelProbability: null, settlementSupport: SS.SCHEDULED_UNPROVEN }));
  assert.ok(r.states.length >= 4, `expected several gates, got ${JSON.stringify(r.states)}`);
  for (const s of [S.INELIGIBLE_MODEL_STATUS, S.INELIGIBLE_ROLE, S.INELIGIBLE_NO_MODEL_PROBABILITY, S.INELIGIBLE_SETTLEMENT]) {
    assert.ok(r.states.includes(s), `missing ${s}`);
  }
});

test("identity is required — no eventId or participantId is not a role problem", () => {
  for (const over of [{ eventId: null }, { participantId: null }, { sport: null }]) {
    const r = ev(ok(over));
    assert.ok(r.states.includes(S.INELIGIBLE_IDENTITY));
    assert.equal(r.primaryState, S.INELIGIBLE_IDENTITY, "identity outranks everything — nothing else is trustworthy");
  }
});

test("asOf and maxPriceAgeMs are required — no wall clock, no default staleness", () => {
  assert.throws(() => evaluateCandidate(ok(), { asOf: ASOF }), /maxPriceAgeMs is required/);
  assert.throws(() => evaluateCandidate(ok(), { maxPriceAgeMs: H12 }), /asOf must be a parseable instant/);
  assert.throws(() => evaluateCandidate(ok(), { asOf: "whenever", maxPriceAgeMs: H12 }), /asOf must be a parseable instant/);
});

test("zero eligible folds to NO_QUALIFYING_PLAY — a valid product output", () => {
  const none = foldUniverse([ev(ok({ participation: "AVAILABLE_ROLE_UNCERTAIN" })), ev(ok({ familyState: "REJECTED" }))]);
  assert.equal(none.eligible, 0);
  assert.equal(none.verdict, "NO_QUALIFYING_PLAY");
  assert.equal(none.rejected, 2);

  const some = foldUniverse([ev(ok()), ev(ok({ familyState: "REJECTED" }))]);
  assert.equal(some.eligible, 1);
  assert.equal(some.verdict, "CANDIDATES_AVAILABLE");
  assert.equal(some.bySport.nfl.eligible, 1);
});

test("the fold counts multi-sport, so one sport cannot hide inside a total", () => {
  const f = foldUniverse([
    ev(ok({ sport: "nfl" })),
    ev(ok({ sport: "mlb", marketFamily: "batter_hits", modelProbability: null })),
    ev(ok({ sport: "ufc", marketFamily: "fight_result", familyState: "SCAFFOLD_ONLY" })),
  ]);
  assert.deepEqual(Object.keys(f.bySport).sort(), ["mlb", "nfl", "ufc"]);
  assert.equal(f.bySport.nfl.eligible, 1);
  assert.equal(f.bySport.mlb.eligible, 0);
  assert.equal(f.bySport.ufc.eligible, 0);
});
