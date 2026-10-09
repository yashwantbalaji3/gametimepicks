/**
 * MLB frozen pregame carry-forward, proven per game (Session 10). Synthetic fixtures; the three-run sequence
 * replays the 2026-10-03 shape: a pregame file, a first post-pitch refresh, a second post-pitch refresh.
 *
 * Run: cd app && npx tsx --test src/lib/mlb/full-game/frozen-carry.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { carryFrozenPregame } from "./frozen-carry.mjs";

const FP = "2030-06-01T17:00:00Z";
const sim = (hash, extra = {}) => ({ gamePk: 1, firstPitch: FP, status: "degraded", completeness: { level: "degraded" }, runs: { home: { median: 4 }, away: { median: 3 } }, artifactHash: hash, ...extra });
const refusal = () => ({ gamePk: 1, firstPitch: FP, status: "unavailable", completeness: { level: "unavailable" }, runs: null, artifactHash: "refused" });
const started = new Set([1]);

function rerun(prior, runGeneratedAt) {
  const r = carryFrozenPregame({ games: [refusal()], priorArtifact: prior, startedPks: started });
  const artifact = { generatedAt: runGeneratedAt, games: r.games };
  if (r.carriedPks.size) artifact.frozenPregame = r.frozenPregame;
  return { artifact, r };
}

test("the 2026-10-03 shape: a game carried on the first post-pitch refresh SURVIVES the second (it used to be erased)", () => {
  const morning = { generatedAt: "2030-06-01T15:11:00Z", games: [sim("pregame-hash")] };
  const first = rerun(morning, "2030-06-01T18:46:00Z");
  assert.deepEqual(first.artifact.games, [morning.games[0]], "first refresh: carried byte-for-byte");
  assert.deepEqual(first.artifact.frozenPregame, { 1: { forecastGeneratedAt: "2030-06-01T15:11:00Z", artifactHash: "pregame-hash" } });
  const second = rerun(first.artifact, "2030-06-01T19:20:00Z");
  assert.deepEqual(second.artifact.games, [morning.games[0]], "second refresh: still the pregame forecast, not a refusal");
  assert.deepEqual(second.artifact.frozenPregame, first.artifact.frozenPregame, "the proof is copied forward unchanged — the original instant, not the refresh's");
  const third = rerun(second.artifact, "2030-06-01T22:15:00Z");
  assert.deepEqual(third.artifact.games, [morning.games[0]]);
});

test("a prior simulated AFTER first pitch is never carried (no ledger can vouch for it)", () => {
  const late = { generatedAt: "2030-06-01T17:30:00Z", games: [sim("post-pitch-hash")] };
  const r = rerun(late, "2030-06-01T18:00:00Z");
  assert.equal(r.artifact.games[0].status, "unavailable");
  assert.equal(r.artifact.frozenPregame, undefined);
});

test("MUTATION GUARD · a ledger entry whose hash does not match the stored game is ignored", () => {
  const forged = { generatedAt: "2030-06-01T18:46:00Z", games: [sim("post-pitch-hash")], frozenPregame: { 1: { forecastGeneratedAt: "2030-06-01T15:11:00Z", artifactHash: "pregame-hash" } } };
  assert.equal(rerun(forged, "2030-06-01T19:20:00Z").artifact.games[0].status, "unavailable");
});

test("a ledger entry stamped after first pitch is ignored", () => {
  const bad = { generatedAt: "2030-06-01T18:46:00Z", games: [sim("h")], frozenPregame: { 1: { forecastGeneratedAt: "2030-06-01T17:01:00Z", artifactHash: "h" } } };
  assert.equal(rerun(bad, "2030-06-01T19:20:00Z").artifact.games[0].status, "unavailable");
});

test("an unavailable prior is never carried, and a game not yet started is always this run's own simulation", () => {
  const prior = { generatedAt: "2030-06-01T15:00:00Z", games: [refusal()] };
  assert.equal(rerun(prior, "2030-06-01T18:00:00Z").r.carriedPks.size, 0);
  const fresh = sim("fresh");
  const r = carryFrozenPregame({ games: [fresh], priorArtifact: { generatedAt: "2030-06-01T15:00:00Z", games: [sim("old")] }, startedPks: new Set() });
  assert.equal(r.games[0], fresh);
  assert.equal(r.carriedPks.size, 0);
});

test("no prior artifact: nothing carried, nothing invented", () => {
  const r = carryFrozenPregame({ games: [refusal()], priorArtifact: null, startedPks: started });
  assert.equal(r.games[0].status, "unavailable");
  assert.deepEqual(r.frozenPregame, {});
});

test("MLB-001 version transition: a pa-v2 forecast carried into the first pa-v3 file keeps the version that made it", () => {
  const v2Morning = { generatedAt: "2030-06-01T15:11:00Z", modelVersion: "mlb-fullgame-2026.08-pa-v2", games: [sim("v2-hash")] };
  // First v3 refresh after first pitch: the prior file is v2.
  const first = carryFrozenPregame({ games: [refusal()], priorArtifact: v2Morning, startedPks: started });
  assert.deepEqual(first.frozenPregame, { 1: { forecastGeneratedAt: "2030-06-01T15:11:00Z", artifactHash: "v2-hash", modelVersion: "mlb-fullgame-2026.08-pa-v2" } });
  // Second v3 refresh: the prior file now says v3, but the entry still names v2 — copied forward, never restamped.
  const v3File = { generatedAt: "2030-06-01T18:46:00Z", modelVersion: "mlb-fullgame-2026.10-pa-v3", games: first.games, frozenPregame: first.frozenPregame };
  const second = carryFrozenPregame({ games: [refusal()], priorArtifact: v3File, startedPks: started });
  assert.deepEqual(second.games, v2Morning.games, "the bytes are the v2 forecast");
  assert.equal(second.frozenPregame[1].modelVersion, "mlb-fullgame-2026.08-pa-v2");
});
