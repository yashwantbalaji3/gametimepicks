/**
 * Regression cases for the CANONICAL research-eligibility re-validation gate (scripts/lib/research-eligibility.mjs).
 * Covers the mission's required scenarios: inherited=true with bad timestamps, capturedAt == eventStart, availableAt
 * after start, missing timestamps, event reschedule, and the newest-eligible-pre-start selection rule. Also pins
 * PARITY with the typed spec note in eligibility.ts (same behavior). No modeling.
 *
 * Run: npx tsx --test src/lib/mlb-research-eligibility-revalidation.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { revalidateMarketEligibility, isMarketRowResearchEligible } from "../../scripts/lib/research-eligibility.mjs";

const START = "2026-07-22T23:07:00Z";
const before = "2026-07-22T22:00:00Z";
const equal = START;
const after = "2026-07-22T23:55:00Z";

test("1 · captured strictly before first pitch (inherited true) ⇒ eligible", () => {
  assert.equal(revalidateMarketEligibility({ inherited: true, capturedAt: before, availableAt: before, eventStartTime: START }).eligible, true);
});

test("2 · captured at/after first pitch ⇒ ineligible even if inherited=true (the leak class)", () => {
  const r = revalidateMarketEligibility({ inherited: true, capturedAt: after, eventStartTime: START });
  assert.equal(r.eligible, false);
  assert.match(r.reason, /at\/after first pitch/);
  assert.equal(r.quality, "POST_START_ONLY");
});

test("3 · capturedAt EXACTLY equal to eventStartTime ⇒ ineligible (equality is out)", () => {
  assert.equal(revalidateMarketEligibility({ inherited: true, capturedAt: equal, eventStartTime: START }).eligible, false);
});

test("4 · availableAt at/after start ⇒ ineligible even if capturedAt is before", () => {
  assert.equal(revalidateMarketEligibility({ inherited: true, capturedAt: before, availableAt: after, eventStartTime: START }).eligible, false);
});

test("5 · missing capturedAt ⇒ ineligible; missing eventStartTime ⇒ ineligible", () => {
  assert.equal(revalidateMarketEligibility({ inherited: true, capturedAt: null, eventStartTime: START }).eligible, false);
  assert.equal(revalidateMarketEligibility({ inherited: true, capturedAt: before, eventStartTime: null }).eligible, false);
});

test("6 · inherited=false is never upgraded (a join can only downgrade)", () => {
  assert.equal(revalidateMarketEligibility({ inherited: false, capturedAt: before, availableAt: before, eventStartTime: START }).eligible, false);
});

test("7 · inherited=true with an unparseable timestamp ⇒ ineligible (not trusted)", () => {
  assert.equal(revalidateMarketEligibility({ inherited: true, capturedAt: "not-a-date", eventStartTime: START }).eligible, false);
  assert.equal(revalidateMarketEligibility({ inherited: true, capturedAt: before, availableAt: "garbage", eventStartTime: START }).eligible, false);
});

test("8 · legacy row without availableAt falls back to inherited + capturedAt<start (does not over-quarantine)", () => {
  assert.equal(revalidateMarketEligibility({ inherited: true, capturedAt: before, availableAt: undefined, eventStartTime: START }).eligible, true);
});

test("9 · EVENT RESCHEDULE: a capture that was pre-start vs the OLD commence becomes ineligible vs the NEW (earlier) start", () => {
  const capturedAt = "2026-07-22T22:50:00Z"; // was pre-start when first pitch was 23:07
  assert.equal(revalidateMarketEligibility({ inherited: true, capturedAt, eventStartTime: "2026-07-22T23:07:00Z" }).eligible, true);
  // game moved earlier to 22:40 → the SAME capture is now post-start
  assert.equal(revalidateMarketEligibility({ inherited: true, capturedAt, eventStartTime: "2026-07-22T22:40:00Z" }).eligible, false);
});

test("10 · SELECTION: newest ELIGIBLE pre-start snapshot wins, not merely the newest overall", () => {
  // three captures for one market: two pre-start (older + newer) and one post-start (newest overall)
  const snaps = [
    { researchEligible: true, capturedAt: "2026-07-22T20:00:00Z" },
    { researchEligible: true, capturedAt: "2026-07-22T22:30:00Z" }, // newest ELIGIBLE
    { researchEligible: true, capturedAt: after },                   // newest overall but POST-START
  ];
  const eligible = snaps.filter((s) => isMarketRowResearchEligible(s, START));
  const chosen = eligible.sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))[0];
  assert.equal(chosen.capturedAt, "2026-07-22T22:30:00Z", "picks the newest PRE-START capture, not the post-start one");
  // and the post-start snapshot is preserved as evidence but flagged ineligible
  assert.equal(isMarketRowResearchEligible(snaps[2], START), false);
});

test("11 · MIXED markets in one game: each row re-validated independently by its own capturedAt", () => {
  const rows = [
    { market: "batter_hits", researchEligible: true, capturedAt: before },
    { market: "h2h", researchEligible: true, capturedAt: after }, // late team-market capture
  ];
  assert.deepEqual(rows.map((r) => isMarketRowResearchEligible(r, START)), [true, false]);
});
