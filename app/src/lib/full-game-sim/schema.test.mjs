/**
 * FULL-GAME SIM SCHEMA VALIDATOR (2026-07-09) — structure + honesty, no fabrication.
 *
 * Pins: a minimal blocked artifact validates, a well-formed ready artifact validates, and the validator
 * rejects bad probability totals, an impossible run count, an invalid source label, and — critically —
 * a PUBLIC artifact that claims simulation while dataQuality is blocked. The validator never generates
 * values (it is pure structure-checking).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { validateFullGameSimArtifact } from "./schema.ts";

const guardrails = { publicFormulaChanged: false, officialMoneyRecordAffected: false, activeProductCard: false };
const teams = { away: { name: "Toronto Blue Jays", abbreviation: "TOR" }, home: { name: "San Francisco Giants", abbreviation: "SF" } };
const base = { schemaVersion: "1.0.0", sport: "MLB", gameId: "g1", date: "2026-07-09", public: false, source: {}, teams, guardrails };

test("1 · a minimal BLOCKED artifact validates (honest 'not ready')", () => {
  const r = validateFullGameSimArtifact({ ...base, dataQuality: { status: "blocked", reasons: ["no scoring model"], missing: ["distributions"] } });
  assert.equal(r.valid, true, r.errors.join("; "));
});

test("2 · a well-formed READY artifact validates", () => {
  const r = validateFullGameSimArtifact({
    ...base, runCount: 10000,
    winProbability: { away: 0.44, home: 0.56, source: "simulation" },
    distributions: { totalRuns: [{ bucket: "0-6", probability: 0.4 }, { bucket: "7-9", probability: 0.35 }, { bucket: "10+", probability: 0.25 }] },
    dataQuality: { status: "ready", reasons: ["sampled"], missing: [] },
  });
  assert.equal(r.valid, true, r.errors.join("; "));
});

test("3 · invalid probability totals are rejected", () => {
  const badWin = validateFullGameSimArtifact({ ...base, winProbability: { away: 0.6, home: 0.6, source: "market_implied" }, dataQuality: { status: "partial", reasons: [], missing: [] } });
  assert.equal(badWin.valid, false);
  assert.ok(badWin.errors.some((e) => /winProbability.*not ~1/.test(e)));
  const badDist = validateFullGameSimArtifact({ ...base, distributions: { margin: [{ bucket: "a", probability: 0.3 }, { bucket: "b", probability: 0.3 }] }, dataQuality: { status: "partial", reasons: [], missing: [] } });
  assert.equal(badDist.valid, false);
  assert.ok(badDist.errors.some((e) => /margin.*not ~1/.test(e)));
});

test("4 · an impossible run count is rejected", () => {
  for (const rc of [0, -1, 3.5]) {
    const r = validateFullGameSimArtifact({ ...base, runCount: rc, dataQuality: { status: "partial", reasons: [], missing: [] } });
    assert.equal(r.valid, false, `runCount ${rc} should be invalid`);
    assert.ok(r.errors.some((e) => /runCount.*positive integer/.test(e)));
  }
});

test("5 · an invalid source label is rejected", () => {
  const r = validateFullGameSimArtifact({ ...base, winProbability: { away: 0.5, home: 0.5, source: "vibes" }, dataQuality: { status: "partial", reasons: [], missing: [] } });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /winProbability.source must be/.test(e)));
});

test("6 · a PUBLIC artifact cannot claim simulation while blocked", () => {
  const r = validateFullGameSimArtifact({
    ...base, public: true, runCount: 10000,
    winProbability: { away: 0.5, home: 0.5, source: "simulation" },
    dataQuality: { status: "blocked", reasons: ["no model"], missing: ["everything"] },
  });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /PUBLIC artifact cannot claim simulation while.*blocked/.test(e)));
  assert.ok(r.errors.some((e) => /blocked but winProbability.source claims simulation/.test(e)));
});

test("7 · guardrails must all be false; a truthy guardrail is rejected", () => {
  const r = validateFullGameSimArtifact({ ...base, guardrails: { ...guardrails, activeProductCard: true }, dataQuality: { status: "blocked", reasons: [], missing: [] } });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /guardrails.*must all be false/.test(e)));
});

test("8 · a simulation source with no runCount is rejected (can't claim a sim that didn't run)", () => {
  const r = validateFullGameSimArtifact({ ...base, winProbability: { away: 0.5, home: 0.5, source: "simulation" }, dataQuality: { status: "ready", reasons: [], missing: [] } });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /simulation but no runCount/.test(e)));
});
