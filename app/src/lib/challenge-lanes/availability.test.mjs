import test from "node:test";
import assert from "node:assert/strict";
import { mirrorEligibility, legBasisRefusals } from "./availability.mjs";
import { searchStep } from "./step-search.mjs";
import { legSignals } from "./levels.mjs";

const NOW = "2026-11-09T18:00:00Z"; const T = "2026-11-09T17:30:00Z"; const OLD = "2026-11-09T09:00:00Z";
const ok = mirrorEligibility({ injuryStatus: null, injuriesFetchedAt: T, rosterStatus: "active", rosterFetchedAt: T, asOf: NOW });

test("contract acceptance (mirror): A2 released, A3 absent+roster active, A4 absent+no roster, A5 stale feed, A8 questionable", () => {
  assert.equal(mirrorEligibility({ injuryStatus: null, injuriesFetchedAt: T, rosterStatus: "released", rosterFetchedAt: T, asOf: NOW }).state, "INELIGIBLE");
  assert.equal(ok.state, "ELIGIBLE");
  assert.equal(mirrorEligibility({ injuryStatus: null, injuriesFetchedAt: T, rosterStatus: null, rosterFetchedAt: T, asOf: NOW }).state, "UNKNOWN");
  assert.equal(mirrorEligibility({ injuryStatus: null, injuriesFetchedAt: OLD, rosterStatus: "active", rosterFetchedAt: T, asOf: NOW }).state, "UNKNOWN");
  assert.equal(mirrorEligibility({ injuryStatus: "Out", injuriesFetchedAt: T, rosterStatus: "active", rosterFetchedAt: T, asOf: NOW }).state, "INELIGIBLE");
  assert.equal(mirrorEligibility({ injuryStatus: null, injuriesFetchedAt: T, rosterStatus: "day-to-day", rosterFetchedAt: T, asOf: NOW }).state, "INELIGIBLE", "A1 shape: absent from feed, roster not active");
  const q = mirrorEligibility({ injuryStatus: "Questionable", injuriesFetchedAt: T, rosterStatus: "active", rosterFetchedAt: T, asOf: NOW });
  assert.ok(legBasisRefusals({ legId: "q", sport: "nba", family: "pts", availability: q }, { now: NOW }).some((x) => x.startsWith("C_AVAILABILITY_QUESTIONABLE")));
});

test("ELIG-04: a leg with no availability record is refused by BOTH step-search and levels (fail closed)", () => {
  const leg = { legId: "nba:1:pts:9:over", sport: "nba", gameId: "1", eventLabel: "A @ B", startUtc: "2026-11-10T00:00Z", family: "pts", player: { playerId: "9", name: "X" }, side: "over", line: 10.5,
    evidence: { level: "B", windows: [{ window: "last20", hits: 16, n: 20 }], shrunk: { rate: 0.7 } } };
  const q = { key: "nba:1:pts:9:over", book: "draftkings", american: 140, line: 10.5, fetchedAt: NOW };
  const s = searchStep({ candidates: [leg], quotes: [q], product: "moonshot", step: 1, bankrollCents: 2500, now: NOW });
  assert.ok(s.cards[0].reasons.some((x) => x.startsWith("C_AVAILABILITY_UNKNOWN")), "step-search: missing record must not pass");
  assert.ok(legSignals({ ...leg, hitRate: null, role: { stable: true } }, { now: NOW }).reasons.some((x) => x.startsWith("C_AVAILABILITY_UNKNOWN")), "levels: missing record must not pass");
  /* the old shape { status: "ACTIVE" } with no stamps is not a record either */
  assert.ok(legBasisRefusals({ ...leg, injury: { status: "ACTIVE" } }, { now: NOW }).some((x) => x.startsWith("C_AVAILABILITY_UNKNOWN")));
  assert.deepEqual(legBasisRefusals({ ...leg, availability: ok }, { now: NOW }), []);
  assert.ok(legBasisRefusals({ ...leg, availability: ok }, { now: "2026-11-10T03:00:00Z" }).some((x) => /stale/.test(x)), "a record goes stale with time");
});

test("R5: an NFL leg on a BLIND_TO_STARTING_QB_ABSENCE forecast is not a leg basis (props and moneylines)", () => {
  const base = { legId: "nfl:2:winner:home", sport: "nfl", family: "winner", teamInputs: { state: "BLIND_TO_STARTING_QB_ABSENCE" } };
  assert.ok(legBasisRefusals(base, { now: NOW }).some((x) => x.startsWith("R5_QB_BLIND_FORECAST")));
  assert.ok(legBasisRefusals({ ...base, legId: "nfl:2:receptions:7:under", family: "receptions", availability: ok }, { now: NOW }).some((x) => x.startsWith("R5_QB_BLIND_FORECAST")));
  assert.deepEqual(legBasisRefusals({ ...base, teamInputs: { state: "QB_AWARE" } }, { now: NOW }), []);
});
