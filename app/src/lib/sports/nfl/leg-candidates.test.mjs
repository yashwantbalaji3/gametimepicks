/**
 * A game that has kicked off at the build instant never supplies a scenario leg (review of #1358, 2026-11-16).
 * Run (from app/): npx tsx --test src/lib/sports/nfl/leg-candidates.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { legCandidates, upcomingBoards } from "./leg-candidates.mjs";
import { screenLegs } from "./leg-screen.mjs";
import { isEligibleProvider } from "../odds/eligible-operators.mjs";

const g = (i, rec) => ({ eventId: `p${i}`, week: 10 - i, date: "2026-10-01", team: "T", opponent: "O", homeAway: "H", state: "STAT_LINE", stats: { rec } });
const log = [6, 6, 7, 5, 6].map((r, i) => g(i, r));
const board = (id, kickoffUtc) => ({
  providerEventId: id, kickoffUtc,
  players: [{ playerId: `pl-${id}`, name: `P${id}`, team: `T${id}`, eligibility: { state: "ELIGIBLE" },
    markets: { player_receptions: { median: 5, market: { sportsbook: "draftkings", line: 4.5, overOdds: -150, underOdds: 120, capturedAt: "2026-11-15T12:00:00Z" } } } }],
});
const PLAYED = board("played", "2026-11-15T18:00:00Z"), NEXT = board("next", "2026-11-17T01:15:00Z");
const evidenceByEvent = { played: { "pl-played": log }, next: { "pl-next": log } };
const FAM = { player_receptions: { eligibleForOfficialProducts: true, gtpProbability: false } };
const passedAt = (now) => screenLegs(legCandidates({ boards: [PLAYED, NEXT], evidenceByEvent, now }), { families: FAM, isEligibleBook: isEligibleProvider }).passed;

test("only games after the build instant supply candidates — a played game never supplies a leg", () => {
  const now = "2026-11-16T08:00:00Z";
  assert.deepEqual(upcomingBoards([PLAYED, NEXT], now).map((b) => b.providerEventId), ["next"]);
  const legs = passedAt(now);
  assert.ok(legs.length > 0, "the upcoming game's 5/5 leg passes (the test is not vacuous)");
  assert.deepEqual([...new Set(legs.map((l) => l.eventId))], ["next"], "no leg from the played game");
  assert.ok(passedAt("2026-11-15T12:30:00Z").some((l) => l.eventId === "played"), "before its kickoff the same game does supply a leg");
});

test("kickoff equal to the build instant, or no instant at all, supplies nothing (fail closed)", () => {
  assert.equal(upcomingBoards([PLAYED], "2026-11-15T18:00:00Z").length, 0);
  assert.equal(legCandidates({ boards: [PLAYED, NEXT], evidenceByEvent }).length, 0);
});
