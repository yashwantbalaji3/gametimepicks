/**
 * Forward-coverage guards (P211 · Release C) — synthetic snapshots only. The contract under test:
 * refusals are typed (never zeros), started events never count as forward, a stale index says so,
 * counts reconcile by construction, and MLB's daily contract types its own absence of future
 * staging as design.
 *
 * Run: npx tsx --test src/lib/products/forward-coverage.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { eplForwardCoverage, ufcForwardCoverage, nflForwardCoverage, mlbForwardCoverage, deriveForwardCoverage } from "./forward-coverage.mjs";

const NOW = Date.parse("2026-08-26T12:00:00Z");

test("REFUSAL is typed, never zeros: a missing snapshot names itself", () => {
  const r = eplForwardCoverage({ fixtures: null, odds: {}, forecastRows: [], nowMs: NOW });
  assert.equal(r.state, "REFUSED");
  assert.equal(r.counts, null, "no counts — zeros would read as a real empty window");
  assert.deepEqual(r.findings, ["MISSING_SNAPSHOT:fixtures capture"]);
});

test("EPL: future fixtures partition into priced/generated; a priced fixture without a forecast is a typed finding", () => {
  const fixtures = { generatedAt: "g", rows: [
    { eventId: "m1", matchup: "ARS vs CHE", kickoffUtc: "2026-08-29T11:30:00Z" },
    { eventId: "m2", matchup: "LIV vs MCI", kickoffUtc: "2026-08-29T14:00:00Z" },
    { eventId: "past", matchup: "old", kickoffUtc: "2026-08-20T14:00:00Z" },
    { eventId: "far", matchup: "beyond", kickoffUtc: "2026-09-30T14:00:00Z" },
  ] };
  const odds = { capturedAt: "c", events: [{ eventId: "m1" }, { eventId: "m2" }] };
  const r = eplForwardCoverage({ fixtures, odds, forecastRows: [{ eventId: "m1", state: "CURRENT_PRE_EVENT" }, { eventId: "m2", state: "READY_EXCEPT_ODDS" }], nowMs: NOW });
  assert.equal(r.counts.scheduled, 2, "past and beyond-horizon fixtures excluded");
  assert.equal(r.counts.priced, 2);
  assert.equal(r.counts.generated, 1);
  assert.ok(r.findings.some((x) => x.startsWith("GENERATION_PENDING:1 priced future fixture(s) without live distributions")), "refusal rows never count as generated");
});

test("UFC: a future card derives per-bout; a started card yields NO forward events and says so", () => {
  const card = { event: { name: "UFC X", startUtc: "2026-08-29T07:00:00Z", boutCount: 2 }, bouts: [
    { boutId: "b1", matchup: "A vs B", model: { p: 0.6 }, market: { ml: -150 } },
    { boutId: "b2", matchup: "C vs D" },
  ] };
  const future = ufcForwardCoverage({ card, odds: { bouts: [{ boutId: "b2" }] }, nowMs: NOW });
  assert.equal(future.counts.scheduled, 2);
  assert.equal(future.counts.generated, 1);
  assert.equal(future.counts.priced, 2, "b1 by embedded market, b2 by the odds capture's boutId join");
  const started = ufcForwardCoverage({ card: { ...card, event: { ...card.event, startUtc: "2026-08-26T07:00:00Z" } }, nowMs: NOW });
  assert.equal(started.state, "STARTED");
  assert.equal(started.events.length, 0, "a started event is never forward coverage");
  assert.ok(started.findings.some((f) => f.startsWith("CARD_STARTED:")));
});

test("UFC: a declared/carried bout-population mismatch is a finding, not a silent truncation", () => {
  const card = { event: { startUtc: "2026-08-29T07:00:00Z", boutCount: 3 }, bouts: [{ boutId: "b1" }] };
  const r = ufcForwardCoverage({ card, nowMs: NOW });
  assert.ok(r.findings.includes("POPULATION_MISMATCH:card declares 3 bouts but carries 1"));
});

test("NFL: a past next-event pointer with NOTHING scheduled types STALE — never quiet emptiness", () => {
  const r = nflForwardCoverage({ index: { nextKickoffUtc: "2026-08-24T00:00:00Z", events: [{ kickoffUtc: "2026-08-24T00:00:00Z" }] }, schedule: { rows: [] }, nowMs: NOW });
  assert.equal(r.state, "STALE");
  assert.ok(r.findings.some((f) => f.startsWith("STALE_FORWARD_INDEX:")));
});

test("NFL: scheduled games without forecasts under a non-LIVE model type as DECISION, not staleness", () => {
  const r = nflForwardCoverage({
    index: { nextKickoffUtc: null, events: [], marketCapturedAt: "c" },
    schedule: { rows: [{ providerEventId: "e1", shortName: "DAL @ NYG", dateUtc: "2026-08-28T23:00:00Z", seasonType: 1 }] },
    modelStatus: { teamSimulation: { state: "PUBLIC_EXPERIMENTAL" } },
    nowMs: NOW,
  });
  assert.equal(r.state, "SCHEDULE_ONLY");
  assert.equal(r.counts.scheduled, 1);
  assert.equal(r.counts.generated, 0);
  assert.ok(r.findings.some((f) => f.startsWith("MODEL_ABSENT_BY_DECISION:")));
  const live = nflForwardCoverage({
    index: { events: [{ eventId: "e1", kickoffUtc: "2026-08-28T23:00:00Z" }], marketCapturedAt: "c" },
    schedule: { rows: [{ providerEventId: "e1", shortName: "DAL @ NYG", dateUtc: "2026-08-28T23:00:00Z" }] },
    modelStatus: { teamSimulation: { state: "LIVE" } },
    nowMs: NOW,
  });
  assert.equal(live.state, "DERIVED");
  assert.equal(live.counts.generated, 1);
});

test("MLB: daily by contract — started games flagged, future staging typed as absent BY DESIGN", () => {
  const board = { games: [
    { gamePk: 1, matchup: "NYY @ BOS", gameTimeUtc: "2026-08-26T10:05:00Z" },
    { gamePk: 2, matchup: "LAD @ SF", gameTimeUtc: "2026-08-26T23:10:00Z" },
  ] };
  const r = mlbForwardCoverage({ board, date: "2026-08-26", nowMs: NOW });
  assert.equal(r.state, "DAILY_BY_CONTRACT");
  assert.equal(r.counts.started, 1);
  assert.ok(r.findings[0].startsWith("FUTURE_STAGING_ABSENT_BY_DESIGN:"));
});

test("counts reconcile by construction: every count equals the sum of its events' own flags", () => {
  const all = deriveForwardCoverage({
    nowMs: NOW,
    epl: { fixtures: { rows: [{ eventId: "m1", kickoffUtc: "2026-08-29T11:30:00Z" }] }, odds: { events: [{ eventId: "m1" }] }, forecastRows: [] },
    ufc: { card: { event: { startUtc: "2026-08-29T07:00:00Z", boutCount: 1 }, bouts: [{ boutId: "b1" }] } },
    nfl: { index: { events: [] } },
    mlb: { board: { games: [] }, date: "2026-08-26" },
  });
  for (const s of all.sports.filter((x) => x.counts)) {
    assert.equal(s.counts.scheduled, s.events.length, `${s.sport} scheduled = events`);
    assert.equal(s.counts.priced, s.events.filter((e) => e.priced).length, `${s.sport} priced reconciles`);
    assert.equal(s.counts.generated, s.events.filter((e) => e.generated).length, `${s.sport} generated reconciles`);
    assert.equal(s.counts.started, s.events.filter((e) => e.started).length, `${s.sport} started reconciles`);
  }
});
