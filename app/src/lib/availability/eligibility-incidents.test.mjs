/**
 * ELIGIBILITY CONTRACT v1 · HISTORICAL INCIDENT REGRESSIONS (founder 2026-11-09: "using the injury, roster and forecast
 * information actually available at the original publication time"). Every fixture is a minimal slice of a file AS
 * COMMITTED at that instant (__fixtures__/incidents-2026-11.json names each source commit and path).
 * Run (from app/): npx tsx --test src/lib/availability/eligibility-incidents.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveEligibility, gameEligibility, SEND_MAX_AGE_HOURS } from "./eligibility.mjs";
import { recoverFromHistory } from "../sports/injuries/carry-forward.mjs";

const FX = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__", "incidents-2026-11.json"), "utf8"));
const A = FX.achane;
const K = FX.kendreMiller;

test("fixtures name the commit each slice was taken from", () => {
  for (const s of [A.injuriesAtPublish, A.lastCaptureListingHim, A.rosterAtPublish, A.boardRowAtPublish, K.rosterBefore, K.rosterAfter, K.injuriesAfter, ...FX.qbBlind]) assert.match(s.source.commit, /^[0-9a-f]{40}$/);
});

test("Achane, as published 2026-11-08T16:52Z: the committed capture had forgotten him and the board carried four markets", () => {
  assert.deepEqual(A.injuriesAtPublish.entries, [], "ESPN's capped list no longer listed his IR");
  assert.equal(A.rosterAtPublish.teams[0].players.find((p) => p.id === "4429160").status.type, "day-to-day");
  assert.deepEqual(A.boardRowAtPublish.row.markets, ["anytime_td", "player_receptions", "player_rush_yds", "player_reception_yds"].sort());
});

test("Achane: the same publish-time files, read through the contract, are never ELIGIBLE — UNKNOWN from the capture alone (R2/R3)", () => {
  const r = resolveEligibility({ sport: "nfl", playerId: "4429160", teamId: "15", asOf: A.publishedAt, injuries: A.injuriesAtPublish, roster: A.rosterAtPublish });
  assert.equal(r.state, "UNKNOWN");
});

test("Achane (A1): with the designation history the repository held at publish time, R1 resolves him INELIGIBLE", () => {
  // the git history of the capture is the designation ledger: his last listing (IR, 2026-09-28) carried forward with no expiry
  const history = recoverFromHistory({ nowIso: A.injuriesAtPublish.generatedAt, captures: [A.lastCaptureListingHim, A.injuriesAtPublish], roster: A.rosterAtPublish });
  assert.equal(history.carried.length, 1, "his IR is recovered from history");
  const r = resolveEligibility({ sport: "nfl", playerId: "4429160", teamId: "15", asOf: A.publishedAt, injuries: { generatedAt: A.injuriesAtPublish.generatedAt, entries: history.entries }, roster: A.rosterAtPublish });
  assert.equal(r.state, "INELIGIBLE");
  assert.deepEqual(r.reasons, ["LONG_TERM_DESIGNATION"]);
  assert.equal(r.sources.injuries.statedAt, "2026-09-28T20:10Z");
});

test("Kendre Miller (A2): on the NO roster at 2026-11-07T19:19Z, gone from it at 00:14Z — INELIGIBLE at the build, never publishable at send", () => {
  const before = resolveEligibility({ sport: "nfl", playerId: "4599739", teamId: "18", asOf: K.rosterBefore.generatedAt, injuries: { ...K.injuriesAfter, generatedAt: K.rosterBefore.generatedAt }, roster: K.rosterBefore });
  assert.notEqual(before.state, "INELIGIBLE", "before the release he was on the roster");
  const build = resolveEligibility({ sport: "nfl", playerId: "4599739", teamId: "18", asOf: K.rosterAfter.generatedAt, injuries: K.injuriesAfter, roster: K.rosterAfter });
  assert.equal(build.state, "INELIGIBLE");
  assert.deepEqual(build.reasons, ["NOT_ON_ROSTER"]);
  const send = resolveEligibility({ sport: "nfl", playerId: "4599739", teamId: "18", asOf: "2026-11-08T14:31:00Z", injuries: K.injuriesAfter, roster: K.rosterAfter, maxAgeHours: SEND_MAX_AGE_HOURS });
  assert.notEqual(send.state, "ELIGIBLE", "at send time the 14-hour-old roster cannot clear him either");
});

test("JAX @ BAL and BUF @ MIN (A7, R5): a QB-blind forecast is not publishable as a social post or a challenge basis", () => {
  assert.deepEqual(FX.qbBlind.map((g) => g.providerEventId).sort(), ["401873037", "401873051"]);
  for (const g of FX.qbBlind) {
    const v = gameEligibility({ teamInputs: g.teamInputs });
    assert.equal(v.publishable, false, g.matchup);
    assert.deepEqual(v.reasons, ["R5_QB_BLIND"]);
  }
  assert.equal(gameEligibility({ teamInputs: { state: "NO_STARTING_QB_ABSENCE", consumedByModel: false } }).publishable, true);
  assert.deepEqual(gameEligibility({ teamInputs: null }), { publishable: false, reasons: ["R5_TEAM_INPUTS_UNKNOWN"], contractVersion: "eligibility@1" }, "no team-input record: unknown, not publishable");
});
