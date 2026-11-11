/**
 * TRANSACTION RECONCILIATION (founder decision 4, 2026-11-09): verified activations / reinstatements end recovered IR and
 * suspension designations; an unverifiable one clears nothing. The sentences are ESPN's own wording, as fetched on
 * 2026-11-09 (Falcons, 2026-11-07); the roster is a fixture.
 * Run (from app/): npx tsx --test src/lib/availability/transactions.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseActivations, activatedNames, activationAfter, normName } from "./transactions.mjs";
import { carryForwardDesignations } from "../sports/injuries/carry-forward.mjs";
import { resolveEligibility } from "./eligibility.mjs";

const ATL = "1";
const roster = { generatedAt: "2026-11-08T12:00:00Z", teams: [
  { providerTeamId: ATL, teamAbbr: "ATL", players: [
    { id: "101", fullName: "Yasir Abdullah", status: { type: "active" } },
    { id: "102", fullName: "Beaux Collins", status: { type: "day-to-day" } },
    { id: "103", fullName: "James Pearce Jr.", status: { type: "day-to-day" } },
    { id: "104", fullName: "Khalil Herbert", status: { type: "active" } },
    { id: "105", fullName: "Brian Robinson Jr.", status: { type: "day-to-day" } },
    { id: "106", fullName: "Chris Smith", status: { type: "active" } },
    { id: "107", fullName: "Chris Smith", status: { type: "active" } },
  ] },
  { providerTeamId: "3", teamAbbr: "CHI", players: [{ id: "301", fullName: "Drake Jackson", status: { type: "active" } }] },
] };
const feed = { transactions: [
  { date: "2026-11-07T08:00Z", team: { id: ATL }, description: "Activated LB Yasir Abdullah and WR Beaux Collins from injured reserve. Signed RB Khalil Herbert to the active roster. Placed RB Brian Robinson Jr. on injured reserve. Activated DE James Pearce Jr. from the suspended list. Elevated LB Drake Jackson from the practice squad." },
  { date: "2026-11-06T08:00Z", team: { id: ATL }, description: "Activated S Chris Smith from injured reserve." },
  { date: "2026-11-05T08:00Z", team: { id: ATL }, description: "Reinstated CB Nobody Here from the suspended list." },
] };

test("activation sentences: IR / suspended list / reinstated activate; placements, signings, elevations do not", () => {
  assert.deepEqual(activatedNames("Activated LB Yasir Abdullah and WR Beaux Collins from injured reserve."), { kind: "ACTIVATED_FROM_IR", names: ["Yasir Abdullah", "Beaux Collins"] });
  assert.deepEqual(activatedNames("Activated DE James Pearce Jr. from the suspended list."), { kind: "REINSTATED_FROM_SUSPENSION", names: ["James Pearce Jr."] });
  assert.equal(activatedNames("Placed RB Brian Robinson Jr. on injured reserve."), null);
  assert.equal(activatedNames("Signed RB Khalil Herbert to the active roster."), null);
  assert.equal(activatedNames("Elevated LB Drake Jackson from the practice squad."), null);
  assert.equal(activatedNames("Activated WR Someone to the active roster."), null, "not a return from a list");
  assert.equal(normName("James Pearce Jr."), normName("james pearce jr"));
});

test("identity: a name counts only when it is exactly ONE player on THAT team's captured roster", () => {
  const p = parseActivations(feed, roster, { sport: "nfl" });
  assert.deepEqual(p.activations.map((a) => [a.athleteId, a.kind, a.date]), [
    ["101", "ACTIVATED_FROM_IR", "2026-11-07T08:00Z"],
    ["102", "ACTIVATED_FROM_IR", "2026-11-07T08:00Z"],
    ["103", "REINSTATED_FROM_SUSPENSION", "2026-11-07T08:00Z"],
  ]);
  assert.deepEqual(p.unmatched.map((u) => [u.name, u.reason]).sort(), [["Chris Smith", "AMBIGUOUS_NAME"], ["Nobody Here", "NOT_ON_TEAM_ROSTER"]]);
});

const IR = (athleteId, statedAt) => ({ sport: "nfl", providerTeamId: ATL, athleteId, status: "Injured Reserve", statedAt, carriedForward: true, absentFromFeedSince: "2026-10-12T00:00:00Z" });

test("carry-forward: a verified activation dated AFTER the designation ends it; one dated before, or unverified, does not", () => {
  const { activations } = parseActivations(feed, roster, { sport: "nfl" });
  const r = carryForwardDesignations({ previousEntries: [IR("102", "2026-09-28T20:10Z"), IR("105", "2026-11-08T10:00Z"), IR("106", "2026-09-01T00:00Z")], currentEntries: [], nowIso: "2026-11-09T00:35:18Z", activations });
  assert.deepEqual(r.carried.map((e) => e.athleteId).sort(), ["105", "106"], "102 activated 11-07 (after 09-28); 105 placed after; 106's activation was ambiguous");
  assert.equal(r.skipped.activatedByTransaction, 1);
  assert.equal(activationAfter(activations, "102", "2026-11-07T09:00:00Z"), null, "an activation stamped before the designation is not evidence it ended");
});

test("the contract: a carried designation with a verified later activation is no longer INELIGIBLE; an activation after asOf is not yet known", () => {
  const { activations } = parseActivations(feed, roster, { sport: "nfl" });
  const injuries = { generatedAt: "2026-11-09T00:35:18Z", entries: [IR("101", "2026-09-28T20:10Z")] };
  // the roster has not caught up with the activation (day-to-day), so only the transaction can end the designation
  const dtd = { ...roster, teams: roster.teams.map((t) => ({ ...t, players: t.players.map((p) => (p.id === "101" ? { ...p, status: { type: "day-to-day" } } : p)) })) };
  const at = (asOf, acts = activations, ros = dtd) => resolveEligibility({ sport: "nfl", playerId: "101", teamId: ATL, asOf, injuries: { ...injuries, generatedAt: asOf }, roster: { ...ros, generatedAt: asOf }, activations: acts });
  const tx = at("2026-11-09T00:35:18Z");
  assert.equal(tx.state, "UNKNOWN", "no longer INELIGIBLE; not cleared to feature until a source confirms (R2)");
  assert.deepEqual(tx.reasons, ["ACTIVATED_BY_TRANSACTION", "ROSTER_NOT_ACTIVE"]);
  assert.equal(at("2026-11-06T12:00:00Z").state, "INELIGIBLE", "on 11-06 the 11-07 activation had not happened");
  assert.equal(at("2026-11-09T00:35:18Z", []).state, "INELIGIBLE", "no transaction evidence: the designation stays in force");
  // and once the roster agrees the player is ELIGIBLE (roster activation, R1)
  assert.equal(at("2026-11-09T00:35:18Z", activations, roster).state, "ELIGIBLE");
});
