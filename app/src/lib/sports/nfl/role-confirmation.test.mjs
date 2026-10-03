/**
 * Session 9 · C — the role receipt is fail-closed, family-specific, and today confirms nothing the product
 * gate accepts. Mutation probes (C6 / §13) land on a receipt that reached the QB path and must be caught.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ACCEPTED_BY_GATE, FAMILY_ROLE, REASON, ROLE_STATE, evaluateRole, satisfiesGate } from "./role-confirmation.mjs";

const KICK = "2026-10-04T17:00:00Z";
const base = () => ({
  eventId: "nfl-1", eventStartUtc: KICK, family: "player_pass_yds",
  player: { playerId: "nfl-athlete-100", team: "AAA" },
  roster: { generatedAt: "2026-10-04T12:00:00Z", teams: [
    { teamAbbr: "AAA", providerTeamId: "1", players: [{ id: "100", status: { type: "active" } }, { id: "101", status: { type: "active" } }, { id: "102", status: { type: "practice-squad" } }] },
    { teamAbbr: "BBB", providerTeamId: "2", players: [{ id: "200", status: { type: "active" } }] },
  ] },
  injuries: { generatedAt: "2026-10-04T15:40:00Z", entries: [{ providerTeamId: "1", athleteId: "101", status: "Questionable", statedAt: "2026-10-02T20:00:00Z" }] },
  depth: { timestamp: "2026-10-04T06:00:00Z", team: "AAA", quarterbacks: [{ playerId: "100", rank: 1 }, { playerId: "101", rank: 2 }] },
  asOf: "2026-10-04T15:45:00Z",
});

test("the QB path reaches PROJECTED_DEPTH_STARTER — which the product gate does NOT accept", () => {
  const r = evaluateRole(base());
  assert.equal(r.state, ROLE_STATE.PROJECTED_DEPTH_STARTER);
  assert.equal(satisfiesGate(r), false);
  assert.ok(!ACCEPTED_BY_GATE.includes(ROLE_STATE.PROJECTED_DEPTH_STARTER));
  for (const k of ["eventId", "playerId", "team", "family", "source", "capturedAt", "sourceAsOf", "expiresAt"]) assert.ok(r[k], k);
});

test("no state this module can emit satisfies the gate — 'not inactive' never becomes 'confirmed'", () => {
  for (const s of Object.values(ROLE_STATE)) if (s !== ROLE_STATE.CONFIRMED) assert.equal(satisfiesGate({ state: s }), false, s);
  for (const family of Object.keys(FAMILY_ROLE)) {
    const r = evaluateRole({ ...base(), family });
    assert.equal(satisfiesGate(r), false, family);
    if (family !== "player_pass_yds") assert.deepEqual([r.state, r.reasons], [ROLE_STATE.UNCERTAIN, [REASON.NO_POSITIVE_ROLE_SOURCE]], family);
  }
});

const probes = [
  ["inactive player confirmed", (o) => o.injuries.entries.push({ providerTeamId: "1", athleteId: "100", status: "Out", statedAt: "2026-10-04T15:30:00Z" }), REASON.DESIGNATED_OUT],
  ["wrong team (board team ≠ roster team)", (o) => { o.player.team = "BBB"; o.depth.team = "BBB"; }, REASON.WRONG_TEAM],
  ["prior-team role after a transaction", (o) => { o.roster.teams[0].players.shift(); o.roster.teams[1].players.push({ id: "100", status: { type: "active" } }); }, REASON.WRONG_TEAM],
  ["stale depth chart", (o) => { o.depth.timestamp = "2026-10-02T13:00:00Z"; }, REASON.DEPTH_CHART_STALE],
  ["QB2 treated as QB1", (o) => { o.player.playerId = "nfl-athlete-101"; o.injuries.entries = []; }, REASON.NOT_DEPTH_QB1],
  ["two QB1s on the chart", (o) => { o.depth.quarterbacks[1].rank = 1; }, REASON.DEPTH_CHART_AMBIGUOUS],
  ["chart predates a QB designation", (o) => { o.injuries.entries.push({ providerTeamId: "1", athleteId: "101", status: "Active", statedAt: "2026-10-04T10:00:00Z" }); }, REASON.DEPTH_CHART_PREDATES_DESIGNATION],
  ["post-kickoff source labelled pregame", (o) => { o.injuries.generatedAt = "2026-10-04T17:05:00Z"; }, `${REASON.POST_START_SOURCE}:injuries`],
  ["evaluated after kickoff", (o) => { o.asOf = "2026-10-04T17:01:00Z"; }, REASON.POST_START_EVALUATION],
  ["stale injuries", (o) => { o.injuries.generatedAt = "2026-10-02T10:00:00Z"; }, REASON.INJURIES_STALE],
  ["practice-squad player", (o) => { o.player.playerId = "nfl-athlete-102"; }, REASON.PRACTICE_SQUAD],
  ["questionable player", (o) => o.injuries.entries.push({ providerTeamId: "1", athleteId: "100", status: "Questionable", statedAt: "2026-10-03T20:00:00Z" }), REASON.DESIGNATED_QUESTIONABLE],
];
for (const [name, mutate, reason] of probes) {
  test(`role mutation probe — ${name}: lands and is caught`, () => {
    const o = base(); const before = JSON.stringify(o); mutate(o);
    assert.notEqual(JSON.stringify(o), before, "probe did not land");
    const r = evaluateRole(o);
    assert.notEqual(r.state, ROLE_STATE.PROJECTED_DEPTH_STARTER, name);
    assert.ok(r.reasons.includes(reason), `${name}: ${r.reasons}`);
  });
}
