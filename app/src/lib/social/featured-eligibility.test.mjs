import assert from "node:assert/strict";
import { test } from "node:test";

import { featuredEligibility, qbBlindProblem } from "./featured-eligibility.mjs";

const asOf = "2026-11-08T16:00:00Z";
const injuries = { generatedAt: "2026-11-08T14:00:00Z", entries: [] };
const roster = { generatedAt: "2026-11-08T14:00:00Z", teams: [
  { teamAbbr: "MIA", players: [{ id: "4429160", status: { type: "day-to-day" } }, { id: "m1", status: { type: "active" } }] },
  { teamAbbr: "NO", players: [{ id: "n1", status: { type: "active" } }] },
  { teamAbbr: "DET", players: [{ id: "d1", status: { type: "active" } }] },
] };
const p = (playerId, name, team, hasMarket = true) => ({ playerId, name, team, hasMarket });

test("A1 Achane (MIA, absent from the feed, roster day-to-day, no TD market) refuses the DET@MIA card, records his state and warns MARKET_ABSENT", () => {
  const r = featuredEligibility({ sport: "nfl", asOf, injuries, roster, players: [p("d1", "Jahmyr Gibbs", "DET"), p("4429160", "De'Von Achane", "MIA", false), p("m1", "Jaylen Waddle", "MIA")], history: { 4429160: [{ status: "Injured Reserve", statedAt: "2026-09-28T20:10Z" }] } });
  assert.equal(r.ok, false);
  assert.match(r.refusals.join(" "), /De'Von Achane \(MIA\) is INELIGIBLE: R1_LONG_TERM_NOT_CLEARED/);
  const c = r.claims.find((x) => x.playerId === "4429160");
  assert.deepEqual([c.state, c.contractVersion, c.sources.roster.status], ["INELIGIBLE", "eligibility@1", "day-to-day"]);
  assert.deepEqual(r.warnings.map((w) => [w.code, w.playerId]), [["MARKET_ABSENT", "4429160"]]);
  assert.equal(r.freshCheckRequired, true);
  assert.equal(r.claims.length, 3, "every featured player is recorded, none is dropped or replaced");
});

test("A2 Kendre Miller (released, off the NO roster) refuses the CLE@NO card", () => {
  const r = featuredEligibility({ sport: "nfl", asOf, injuries, roster, players: [p("n1", "Alvin Kamara", "NO"), p("km", "Kendre Miller", "NO")] });
  assert.equal(r.ok, false);
  assert.match(r.refusals.join(" "), /Kendre Miller \(NO\) is INELIGIBLE: NOT_ON_ROSTER/);
});

test("all featured players ELIGIBLE with markets ⇒ ok, no warnings", () => {
  const r = featuredEligibility({ sport: "nfl", asOf, injuries, roster, players: [p("d1", "Jahmyr Gibbs", "DET"), p("m1", "Jaylen Waddle", "MIA")] });
  assert.deepEqual([r.ok, r.warnings.length, r.freshCheckRequired], [true, 0, false]);
});

test("A7 R5: a QB-blind forecast cannot back a game post; a QB-aware one can", () => {
  assert.match(qbBlindProblem({ teamInputs: { state: "BLIND_TO_STARTING_QB_ABSENCE", absences: [{ name: "Kyler Murray", team: "MIN", status: "Out" }] } }), /R5_QB_BLIND.*Kyler Murray MIN Out/);
  assert.equal(qbBlindProblem({ teamInputs: { state: "NO_STARTING_QB_ABSENCE" } }), null);
});
