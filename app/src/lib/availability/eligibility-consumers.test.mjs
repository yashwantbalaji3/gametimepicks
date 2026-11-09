/**
 * ELIGIBILITY CONTRACT v1 — the consumers (PD Wave 1, 2026-11-09). Each test names the defect it pins:
 *   R1   carry-forward: a long-term designation persists until an explicit activation (no 336 h expiry)
 *   NFL  participation: a non-ELIGIBLE player gets no opportunity share and is recorded with {state, contractVersion, sources}
 *   NBA  minutes model: three-state availability — Day-To-Day flagged, no record ⇒ "unknown" (never "active")
 *   PL-02 Parlay Lab: a player leg with no participant status is ineligible (missing status is not health)
 * Run (from app/): npx tsx --test src/lib/availability/eligibility-consumers.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { carryForwardDesignations } from "../sports/injuries/carry-forward.mjs";
import { availabilityFromInjuries } from "../sports/nba/minutes-model.mjs";
import { evaluateCandidate, toCandidate } from "../parlays/v2/candidate.mjs";
import { legReasons, recommendCtx } from "../parlays/v2/recommend.mjs";
import { opportunityEligibility } from "../sports/nfl/participation-eligibility.mjs";

const NOW = "2026-11-09T00:35:18Z";
const IR = { sport: "nfl", providerTeamId: "15", athleteId: "4429160", athleteName: "De'Von Achane", status: "Injured Reserve", statedAt: "2026-09-28T20:10Z" };

test("R1: an IR designation absent from the feed for 42 days is still carried (the 336 h expiry is gone)", () => {
  const r = carryForwardDesignations({ previousEntries: [{ ...IR, carriedForward: true, absentFromFeedSince: "2026-10-12T22:13:00Z" }], currentEntries: [], nowIso: NOW });
  assert.equal(r.carried.length, 1);
  assert.equal(r.entries[0].status, "Injured Reserve");
});

test("R1: the carry ends only on an explicit activation — the feed listing him, or a roster capture after the designation saying active", () => {
  const listed = carryForwardDesignations({ previousEntries: [IR], currentEntries: [{ ...IR, status: "Active", statedAt: "2026-11-08T12:00Z" }], nowIso: NOW });
  assert.equal(listed.carried.length, 0);
  const roster = { generatedAt: NOW, teams: [{ providerTeamId: "15", players: [{ id: IR.athleteId, status: { type: "active" } }] }] };
  const activated = carryForwardDesignations({ previousEntries: [IR], currentEntries: [], nowIso: NOW, roster });
  assert.equal(activated.carried.length, 0);
  assert.equal(activated.skipped.activatedByRoster, 1);
  const dtd = { ...roster, teams: [{ providerTeamId: "15", players: [{ id: IR.athleteId, status: { type: "day-to-day" } }] }] };
  assert.equal(carryForwardDesignations({ previousEntries: [IR], currentEntries: [], nowIso: NOW, roster: dtd }).carried.length, 1, "roster day-to-day is not an activation");
  // a game-week Out still clears when the game is played
  assert.equal(carryForwardDesignations({ previousEntries: [{ ...IR, status: "Out" }], currentEntries: [], nowIso: NOW }).carried.length, 0);
});

test("NFL participation: a non-ELIGIBLE player gets no opportunity share and carries {state, contractVersion, sources}", () => {
  const injuries = { generatedAt: NOW, entries: [] };
  const roster = { generatedAt: NOW, teams: [{ providerTeamId: "15", teamAbbr: "MIA", players: [{ id: "4429160", status: { type: "day-to-day" } }, { id: "7", status: { type: "active" } }] }] };
  const ctx = { asOf: NOW, injuries, roster, teamIdByAbbr: { MIA: "15" } };
  const achane = opportunityEligibility({ playerId: "nfl-athlete-4429160" }, "MIA", ctx);
  assert.equal(achane.eligible, false, "Achane (roster day-to-day, absent from the feed) is not eligible for a share");
  assert.equal(achane.eligibility.state, "UNKNOWN");
  assert.equal(achane.eligibility.contractVersion, "eligibility@1");
  assert.ok(achane.eligibility.sources.roster && achane.eligibility.sources.injuries);
  const ok = opportunityEligibility({ playerId: "nfl-athlete-7" }, "MIA", ctx);
  assert.equal(ok.eligible, true);
  assert.equal(ok.eligibility.state, "ELIGIBLE");
});

test("NBA minutes model: three-state availability — Out, Day-To-Day flagged, no record ⇒ unknown (never active)", () => {
  const feed = [{ athleteId: "1", providerTeamId: "9", status: "Out" }, { athleteId: "2", providerTeamId: "9", status: "Day-To-Day" }];
  assert.equal(availabilityFromInjuries(feed, "9", "1").availability, "out");
  assert.equal(availabilityFromInjuries(feed, "9", "2").availability, "questionable");
  assert.equal(availabilityFromInjuries(feed, "9", "3").availability, "unknown", "absent from the feed is not health");
  assert.equal(availabilityFromInjuries(feed, "9", "3", "active").availability, "active", "R2: the roster independently says active");
  assert.equal(availabilityFromInjuries(feed, "9", "1", "active").availability, "out", "a listed Out is never overruled by the roster");
});

const playerLeg = (extra = {}) => ({ sport: "nfl", league: "nfl", eventId: "e1", market: "player_rush_yds", selection: "P — over 55.5", side: "over", line: 5.5, participant: "Pitcher 1", team: "T1",
  book: "DraftKings", price: -110, americanOdds: -110, capturedAt: "2026-11-09T00:30:00Z", startUtc: "2026-11-09T05:00:00Z", gameStart: "2026-11-09T05:00:00Z", participantStatus: null, receipts: ["x.json"], ...extra });

test("PL-02 candidate gate: a player leg with no participant status is ineligible; a positive status passes that gate", () => {
  const ctx = { now: NOW, coverage: null, isVerifiedOperator: () => true, canEnterLeague: () => true };
  const codes = (leg) => evaluateCandidate(toCandidate(leg), ctx).eligibility.reasons.map((r) => r.code);
  assert.ok(codes(playerLeg()).includes("PARTICIPANT_STATUS_MISSING"));
  assert.ok(!codes(playerLeg({ participantStatus: "Active" })).includes("PARTICIPANT_STATUS_MISSING"));
  assert.ok(codes(playerLeg({ participantStatus: "UNKNOWN" })).includes("PARTICIPANT_UNAVAILABLE"), "the contract's UNKNOWN is never a pass");
  assert.ok(!codes(playerLeg({ participant: null })).includes("PARTICIPANT_STATUS_MISSING"), "a game-winner leg has no participant to check");
  assert.ok(!codes(playerLeg({ sport: "ufc", league: "ufc" })).includes("PARTICIPANT_STATUS_MISSING"), "UFC has no injuries + roster source for the contract to read");
});

test("PL-02 recommend gate: a player leg with no participant status is refused", () => {
  const ctx = recommendCtx({ nowMs: Date.parse(NOW), isVerifiedOperator: () => true, canEnterSport: () => true });
  assert.ok(legReasons(playerLeg(), ctx).includes("PARTICIPANT_STATUS_MISSING"));
  assert.ok(!legReasons(playerLeg({ participantStatus: "Active" }), ctx).includes("PARTICIPANT_STATUS_MISSING"));
  assert.ok(legReasons(playerLeg({ participantStatus: "INELIGIBLE" }), ctx).includes("PARTICIPANT_STATUS"));
});
