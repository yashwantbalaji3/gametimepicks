/**
 * ELIGIBILITY CONTRACT v1 — the consumers (PD Wave 1, 2026-11-09). Each test names the defect it pins:
 *   R1   carry-forward: a long-term designation persists until an explicit activation (no 336 h expiry)
 *   NFL  participation: a non-ELIGIBLE player gets no opportunity share and is recorded with {state, contractVersion, sources}
 *   NBA  the frozen minutes models stay byte-identical; the contract supplies the three states, and NBA Parlay Lab
 *        legs take their status from it (a snapshot's "active" is never a status)
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
import { resolveEligibility } from "./eligibility.mjs";

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

test("NBA: the frozen minutes models are NOT edited (governance: a change is a new candidate); the contract gives the three states", () => {
  // v0.1 / v0.3 re-derive their committed receipts byte-for-byte, so their "absent ⇒ active" reading stays inside the
  // frozen model. The products never take it as a status: the contract (resolveEligibility, sport "nba") answers instead.
  const feed = [{ athleteId: "1", providerTeamId: "9", status: "Out" }, { athleteId: "2", providerTeamId: "9", status: "Day-To-Day" }];
  assert.equal(availabilityFromInjuries(feed, "9", "3").availability, "active", "frozen v0 behaviour, unchanged");
  const roster = { capturedAt: NOW, teams: [{ providerTeamId: "9", state: "CAPTURED", players: [{ providerAthleteId: "2", rosterStatusType: "active" }, { providerAthleteId: "3", rosterStatusType: "active" }] }] };
  const nba = (id, ros = roster) => resolveEligibility({ sport: "nba", playerId: id, teamId: "9", asOf: NOW, injuries: { generatedAt: NOW, entries: feed }, roster: ros });
  assert.equal(nba("1").state, "INELIGIBLE");
  assert.deepEqual([nba("2").state, nba("2").flags], ["ELIGIBLE", ["QUESTIONABLE"]], "Day-To-Day flagged (R6)");
  assert.equal(nba("3").state, "ELIGIBLE", "no record + roster active (R2)");
  assert.equal(nba("3", null).state, "UNKNOWN", "no record + no roster ⇒ UNKNOWN");
});

test("NBA Parlay Lab: a snapshot's 'active' (merely absent from the injury feed) is never a status — no statusFeed ⇒ PARTICIPANT_STATUS_MISSING", async () => {
  const { nbaCandidateInputs } = await import("../parlays/v2/nba-source.mjs");
  const { nbaSlate } = await import("../parlays/v2/__fixtures__/nba-fixtures.mjs");
  const slate = nbaSlate(); // TEST FIXTURE slate: every snapshot row says participation "active"
  const out = nbaCandidateInputs({ results: slate.results, snapshots: slate.snapshots });
  assert.ok(out.inputs.length > 0 && out.inputs.every((i) => i.participantStatus == null));
  const fed = nbaCandidateInputs({ results: slate.results, snapshots: slate.snapshots, statusFeed: slate.statusFeed });
  assert.ok(fed.inputs.every((i) => i.participantStatus === "ELIGIBLE"));
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
