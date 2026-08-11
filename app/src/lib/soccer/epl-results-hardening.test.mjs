/**
 * EPL results-path hardening before opening day (Program 162 · Release E).
 *
 * The P154 adapter tests prove the happy path and the core refusals; these cases prove the
 * OPERATIONAL traps a live season supplies: kickoff moves, alias drift, in-play and abandoned
 * rows that carry scores, and score corrections between captures. Zero changes to grading
 * behavior — every assertion pins what the deployed path already does, so opening day cannot
 * surprise us with a case nobody wrote down.
 *
 * Run: npx tsx --test src/lib/soccer/epl-results-hardening.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { loadCurrentEplResults } from "./epl-current-results.mjs";

const NOW = "2026-08-22T22:00:00Z";
const FIXTURES = { rows: [
  { eventId: "soccer:epl:arsenal-v-coventry-city:20260821t1900", homeClub: "Arsenal", awayClub: "Coventry City", kickoffIso: "2026-08-21T19:00:00Z", matchweek: 1 },
] };
const ART = (rows) => ({ seasonStart: "2026-08-21", sourceAsOf: NOW, rows });
const ROW = (over = {}) => ({ providerEventId: "espn-1", dateUtc: "2026-08-21T19:00:00Z", home: "Arsenal", away: "Coventry City", ftHome: 2, ftAway: 0, statusRaw: "STATUS_FULL_TIME", ...over });

test("KICKOFF MOVE · a result at a moved kickoff quarantines as unjoined until the fixture capture refreshes", () => {
  // The canonical identity is kickoff-based BY DESIGN: a moved match must re-enter through a fresh
  // fixture capture (snapshot-per-capture), never settle against a stale kickoff identity. The
  // quarantine clears on the next cadence run once both sides carry the new time — the runbook
  // documents that flow (docs/EPL_CORRECTIONS_RUNBOOK.md).
  const out = loadCurrentEplResults({ nowIso: NOW, artifact: ART([ROW({ dateUtc: "2026-08-22T19:00:00Z" })]), fixtures: FIXTURES });
  assert.equal(out.results.length, 0, "nothing settles against a stale kickoff identity");
  assert.equal(out.quarantined.length, 1);
  assert.match(out.quarantined[0].reason, /unjoined|no scheduled fixture/);
  assert.equal(out.reconciliation.exact, true);
});

test("ALIAS DRIFT · committed variants resolve; anything outside the table refuses, never fuzzy-joins", () => {
  // "Arsenal FC" is a COMMITTED alias in EPL_CLUB_ALIASES — resolving it is table coverage, not
  // fuzzy matching (this test originally assumed it would refuse; the table said otherwise).
  const committed = loadCurrentEplResults({ nowIso: NOW, artifact: ART([ROW({ home: "Arsenal FC" })]), fixtures: FIXTURES });
  assert.equal(committed.results.length, 1, "a committed alias variant joins deterministically");
  const outside = loadCurrentEplResults({ nowIso: NOW, artifact: ART([ROW({ home: "Arsenal City FC" })]), fixtures: FIXTURES });
  assert.equal(outside.results.length, 0);
  assert.match(outside.quarantined[0].reason, /identity/, "membership is committed, never inferred from a near-miss name");
});

test("NON-FINAL ROWS WITH SCORES · in-play, half-time, postponed and abandoned rows never count as results", () => {
  // The trap class: an abandoned or in-play row CARRIES scores and looks settle-able. Only the
  // completed-status regex admits rows; everything else leaves the state honestly empty.
  const rows = [
    ROW({ providerEventId: "e-inplay", statusRaw: "STATUS_IN_PLAY", ftHome: 1, ftAway: 0 }),
    ROW({ providerEventId: "e-half", statusRaw: "STATUS_HALFTIME", ftHome: 1, ftAway: 1 }),
    ROW({ providerEventId: "e-post", statusRaw: "STATUS_POSTPONED", ftHome: null, ftAway: null }),
    ROW({ providerEventId: "e-aband", statusRaw: "STATUS_ABANDONED", ftHome: 2, ftAway: 0 }),
    ROW({ providerEventId: "e-delay", statusRaw: "STATUS_DELAYED", ftHome: 0, ftAway: 0 }),
  ];
  const out = loadCurrentEplResults({ nowIso: NOW, artifact: ART(rows), fixtures: FIXTURES });
  assert.equal(out.state, "NO_RESULTS_YET", "score-bearing non-final rows leave the state empty, not settled");
  assert.equal(out.results.length, 0);
  assert.equal(out.quarantined.length, 0, "non-final rows are excluded before the join, not quarantined as defects");
});

test("SCORE CORRECTION · the adapter is memoryless: each read grades the artifact it is given (latest-wins before any ledger exists)", () => {
  const first = loadCurrentEplResults({ nowIso: NOW, artifact: ART([ROW({ ftHome: 2, ftAway: 0 })]), fixtures: FIXTURES });
  const corrected = loadCurrentEplResults({ nowIso: NOW, artifact: ART([ROW({ ftHome: 2, ftAway: 2 })]), fixtures: FIXTURES });
  assert.equal(first.results[0].contractCheck, "WIN");
  assert.equal(corrected.results[0].contractCheck, "LOSS", "a corrected draw re-grades from the corrected artifact — no cached prior reading survives");
  // Determinism both ways: repeat reads are byte-identical per input.
  const again = loadCurrentEplResults({ nowIso: NOW, artifact: ART([ROW({ ftHome: 2, ftAway: 0 })]), fixtures: FIXTURES });
  assert.deepEqual(again.results, first.results);
  // The policy boundary this pins: NO ledger writer may exist for EPL until it snapshots its input
  // and records correction lineage — the runbook carries that acceptance condition.
});

test("DUPLICATE PROVIDER ROWS · the same providerEventId twice settles once and quarantines once", () => {
  const out = loadCurrentEplResults({ nowIso: NOW, artifact: ART([ROW(), ROW()]), fixtures: FIXTURES });
  assert.equal(out.results.length, 1);
  assert.equal(out.quarantined.length, 1);
  assert.match(out.quarantined[0].reason, /exactly once/);
  assert.equal(out.reconciliation.exact, true);
});
