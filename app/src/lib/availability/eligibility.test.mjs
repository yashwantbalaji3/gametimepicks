import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveEligibility, ELIGIBILITY_STATE as S, CONTRACT_VERSION } from "./eligibility.mjs";

const asOf = "2026-11-08T16:00:00Z";
const injuries = (entries, generatedAt = "2026-11-08T14:00:00Z") => ({ generatedAt, entries });
const roster = (players, generatedAt = "2026-11-08T14:00:00Z") => ({ generatedAt, teams: [{ teamAbbr: "MIA", players }] });
const r = (o = {}) => resolveEligibility({ sport: "nfl", playerId: "1", teamId: "MIA", asOf, injuries: injuries([]), roster: roster([{ id: "1", status: { type: "active" } }]), ...o });

test("A1 Achane: IR stated, then absent from the feed 30+ days, roster day-to-day ⇒ INELIGIBLE", () => {
  const x = r({ roster: roster([{ id: "1", status: { type: "day-to-day" } }]), history: [{ status: "Injured Reserve", statedAt: "2026-09-28T20:10Z" }] });
  assert.equal(x.state, S.INELIGIBLE);
  assert.ok(x.reasons.includes("R1_LONG_TERM_NOT_CLEARED"));
  assert.equal(x.contractVersion, CONTRACT_VERSION);
  // with no history at all the same player is still not publishable (R2: absence is not health)
  assert.equal(r({ roster: roster([{ id: "1", status: { type: "day-to-day" } }]) }).state, S.UNKNOWN);
});

test("A2 Kendre Miller: released, not on the roster ⇒ INELIGIBLE", () => {
  const x = r({ roster: roster([{ id: "2", status: { type: "active" } }]) });
  assert.equal(x.state, S.INELIGIBLE);
  assert.ok(x.reasons.includes("NOT_ON_ROSTER"));
});

test("A3 absent from the feed, roster active ⇒ ELIGIBLE, with both source stamps", () => {
  const x = r();
  assert.equal(x.state, S.ELIGIBLE);
  assert.equal(x.sources.roster.status, "active");
  assert.equal(x.sources.injuries.status, null);
  assert.equal(x.sources.injuries.fetchedAt, "2026-11-08T14:00:00Z");
});

test("A4 absent from the feed, no roster record at all ⇒ UNKNOWN (no roster source)", () => {
  assert.equal(r({ roster: null }).state, S.UNKNOWN);
});

test("A5 a source older than 6 h at build ⇒ UNKNOWN; the send window is 60 min", () => {
  assert.equal(r({ injuries: injuries([], "2026-11-08T09:59:00Z") }).state, S.UNKNOWN);
  assert.equal(r({ roster: roster([{ id: "1", status: { type: "active" } }], "2026-11-08T09:59:00Z") }).state, S.UNKNOWN);
  assert.equal(r({ maxAgeMinutes: 60 }).state, S.UNKNOWN);
});

test("A6 explicit Active after the IR date ⇒ ELIGIBLE", () => {
  const x = r({ injuries: injuries([{ athleteId: "1", status: "Active", statedAt: "2026-11-07T12:00Z" }]), history: [{ status: "Injured Reserve", statedAt: "2026-09-28T20:10Z" }] });
  assert.equal(x.state, S.ELIGIBLE);
});

test("blocking designations ⇒ INELIGIBLE; a roster that disagrees with an Active feed ⇒ UNKNOWN", () => {
  for (const status of ["Out", "Injured Reserve", "Suspension", "Inactive"]) assert.equal(r({ injuries: injuries([{ athleteId: "1", status, statedAt: "2026-11-08T12:00Z" }]) }).state, S.INELIGIBLE, status);
  assert.equal(r({ injuries: injuries([{ athleteId: "1", status: "Active", statedAt: "2026-11-08T12:00Z" }]), roster: roster([{ id: "1", status: { type: "day-to-day" } }]) }).state, S.UNKNOWN);
});

test("A8 Questionable is ELIGIBLE but flagged: never featured", () => {
  const x = r({ injuries: injuries([{ athleteId: "1", status: "Questionable", statedAt: "2026-11-08T12:00Z" }]) });
  assert.equal(x.state, S.ELIGIBLE);
  assert.equal(x.featurable, false);
  assert.ok(x.reasons.includes("R6_QUESTIONABLE"));
  assert.equal(r().featurable, true);
});
