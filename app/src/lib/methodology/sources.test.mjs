/**
 * World Cup kickoff-join contract — player props key matches by hash/fixture while team records use
 * numeric ids, so the join must work across matchId, normalized team name, and the fixture string.
 * This is what lets WC player props carry an event_start_time and pass leakage validation.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWcKickoffIndex, resolveWcPlayerKickoff } from "./sources.ts";

const TEAM_RECS = [
  { matchId: 17, homeTeam: "France", awayTeam: "Senegal", homeCode: "FR", awayCode: "SN", kickoffUtc: "2026-06-16T19:00:00Z" },
  { matchId: 18, homeTeam: "Iraq", awayTeam: "Norway", homeCode: "IQ", awayCode: "NO", kickoffUtc: "2026-06-16T16:00:00Z" },
];

test("kickoff join resolves by numeric matchId", () => {
  const idx = buildWcKickoffIndex(TEAM_RECS);
  const got = resolveWcPlayerKickoff({ matchId: 17 }, idx);
  assert.equal(got.kickoffUtc, "2026-06-16T19:00:00Z");
  assert.equal(got.code, "FR");
});

test("kickoff join resolves by normalized team name (hash matchId mismatch)", () => {
  const idx = buildWcKickoffIndex(TEAM_RECS);
  // Player file uses a hash matchId that won't match the numeric team id — fall back to team name.
  const got = resolveWcPlayerKickoff({ matchId: "73a4fcd14cc9", player: { name: "Kylian Mbappe", team: "France" } }, idx);
  assert.equal(got.kickoffUtc, "2026-06-16T19:00:00Z");
});

test("kickoff join resolves by fixture string when team field is absent", () => {
  const idx = buildWcKickoffIndex(TEAM_RECS);
  const got = resolveWcPlayerKickoff({ fixture: "Iraq vs Norway" }, idx);
  assert.equal(got.kickoffUtc, "2026-06-16T16:00:00Z");
});

test("kickoff join returns null when no match (never fabricated)", () => {
  const idx = buildWcKickoffIndex(TEAM_RECS);
  const got = resolveWcPlayerKickoff({ player: { team: "Brazil" }, fixture: "Brazil vs Spain" }, idx);
  assert.equal(got.kickoffUtc, null);
});
