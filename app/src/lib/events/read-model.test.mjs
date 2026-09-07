/**
 * P243 · B-1 — the shared event/period read model's contract.
 *
 * Two layers:
 *   LIVE — the adapters run against the real committed artifacts and their populations must
 *   reconcile with the authoritative producers (no fixture can rot into vacuity while the tree
 *   carries real data).
 *   FIXTURE — the charter's acceptance cases (§5): midnight ET vs UTC, a DST transition, a future
 *   event outside the old 18/48/96-hour windows, a started event retained in immutable history,
 *   an unauthorized/archived price beside a valid forecast, distinct dimensions never collapsing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  etDateOf,
  loadSportEvents,
  loadNflEvents,
  loadMlbEvents,
  loadUfcEvents,
  loadEplEvents,
  periodsOf,
  currentPeriodKey,
  eventsInPeriod,
  periodCounts,
} from "./read-model.ts";

const NOW = "2026-09-07T19:30:00Z";

// ── FIXTURE · time semantics ────────────────────────────────────────────────────────────────────

test("etDateOf: a late-evening UTC instant belongs to the PREVIOUS ET day (midnight boundary)", () => {
  // 00:20 UTC Sep 10 is 8:20 PM ET Sep 9 — the NFL opener's real boundary case.
  assert.equal(etDateOf("2026-09-10T00:20:00Z"), "2026-09-09");
  assert.equal(etDateOf("2026-09-10T04:20:00Z"), "2026-09-10");
});

test("etDateOf: DST transition — EST winter instants shift by 5, EDT summer by 4", () => {
  assert.equal(etDateOf("2026-01-15T04:30:00Z"), "2026-01-14"); // EST −5: 23:30 previous day
  assert.equal(etDateOf("2026-07-15T04:30:00Z"), "2026-07-15"); // EDT −4: 00:30 same day
  assert.equal(etDateOf(null), null);
  assert.equal(etDateOf("garbage"), null);
});

// ── LIVE · NFL ──────────────────────────────────────────────────────────────────────────────────

test("LIVE NFL: schedule adapter reconciles with the capture; Week 1 is beyond the old 18h window", () => {
  const events = loadNflEvents(NOW);
  if (!events.length) return; // no capture in this tree state
  const sched = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nfl/schedule/latest.json"), "utf8"));
  assert.equal(events.length, sched.rows.length, "one canonical event per captured row");
  // Identity is provider-scoped, never name+time.
  for (const e of events) {
    assert.match(e.eventId, /^nfl:\d+$/, "provider-scoped id");
    assert.ok(e.providerAliases.some((a) => a.provider === "espn_scoreboard"), "alias lineage present");
  }
  // The regular-season Week 1 period exists and holds events further out than 18/48h — the read
  // model must never inherit the generator's acquisition window.
  const w1 = events.filter((e) => e.phase === "regular" && e.period.key.endsWith("-w1"));
  if (w1.length) {
    const horizonMs = Math.max(...w1.map((e) => Date.parse(e.scheduledUtc ?? "0"))) - Date.parse(NOW);
    assert.ok(horizonMs > 48 * 3600_000, "the selected week extends past the old 48h builder window");
    // Unpriced/unauthorized prices must not suppress the schedule or the model dimension.
    for (const e of w1) {
      assert.equal(e.dimensions.schedule, "CAPTURED");
      assert.ok(["PRICED", "ARCHIVED", "NOT_CAPTURED", "UNAUTHORIZED"].includes(e.dimensions.prices));
    }
  }
});

test("LIVE NFL: an archived preseason price never reads as PRICED now", () => {
  const events = loadNflEvents(NOW);
  const archived = events.filter((e) => e.phase === "preseason" && Date.parse(e.scheduledUtc ?? "0") < Date.parse(NOW));
  for (const e of archived) {
    assert.notEqual(e.dimensions.prices, "PRICED", `${e.eventId}: past kickoff cannot carry a current price`);
  }
});

// ── LIVE · MLB ──────────────────────────────────────────────────────────────────────────────────

test("LIVE MLB 2026-09-07: published/missed split matches the artifact — missed stays missed", () => {
  const events = loadMlbEvents("2026-09-07T23:00:00Z", "2026-09-07");
  if (!events.length) return;
  const counts = periodCounts(events);
  assert.equal(counts.scheduled, 11, "the recorded slate had 11 games");
  assert.equal(counts.modelPublished, 5, "five usable pregame reports (ready+degraded)");
  assert.equal(counts.missedPreEvent, 6, "six missed games are preserved as missed — never backfilled");
  assert.equal(counts.modelPublished + counts.missedPreEvent, counts.scheduled, "the split partitions the slate");
});

// ── LIVE · UFC ──────────────────────────────────────────────────────────────────────────────────

test("LIVE UFC: bouts adapt 1:1; unmodelled bouts are UNSUPPORTED, never silently ready", () => {
  const events = loadUfcEvents(NOW);
  if (!events.length) return;
  const card = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/ufc/card-latest.json"), "utf8"));
  assert.equal(events.length, card.bouts.length, "every scheduled bout is visible");
  const unsupported = events.filter((e) => e.dimensions.model === "UNSUPPORTED").length;
  const modelled = events.filter((e) => e.dimensions.model === "PUBLISHED").length;
  assert.equal(unsupported, card.bouts.filter((b) => b.prediction == null).length, "gaps preserved exactly");
  assert.equal(modelled + unsupported, events.length, "the card partitions into modelled + reasoned gaps");
  // One period: the card itself.
  assert.equal(periodsOf(events).length, 1);
  assert.equal(periodsOf(events)[0].kind, "card");
});

// ── LIVE · EPL ──────────────────────────────────────────────────────────────────────────────────

test("LIVE EPL: fixtures adapt with matchweek periods; a fixture outside 96h is still visible", () => {
  const events = loadEplEvents(NOW);
  if (!events.length) return;
  for (const e of events) {
    assert.match(e.period.key, /-mw\d+$/, "matchweek period key");
    assert.ok(e.providerAliases.length >= 1, "alias lineage");
  }
  // The old 96h forecast window must not bound VISIBILITY: any captured fixture further out than
  // 96h still appears, dimensioned honestly.
  const far = events.filter((e) => Date.parse(e.scheduledUtc ?? "0") - Date.parse(NOW) > 96 * 3600_000);
  for (const e of far) {
    assert.equal(e.dimensions.schedule, "CAPTURED");
    assert.ok(["NOT_PUBLISHED", "UNSUPPORTED"].includes(e.dimensions.model), "no forecast claimed outside the window");
  }
});

// ── Cross-sport selectors ───────────────────────────────────────────────────────────────────────

test("currentPeriodKey picks the period of the next unfinished event; eventsInPeriod scopes exactly", () => {
  for (const sport of ["nfl", "epl", "ufc"]) {
    const events = loadSportEvents(sport, NOW);
    if (!events.length) continue;
    const key = currentPeriodKey(events, NOW);
    assert.ok(key, `${sport}: a current period exists`);
    const inP = eventsInPeriod(events, key);
    assert.ok(inP.length > 0, `${sport}: the current period holds events`);
    for (const e of inP) assert.equal(e.period.key, key);
  }
});

test("NFL current period at NOW is regular-season Week 1, not the settled preseason", () => {
  const events = loadNflEvents(NOW);
  if (!events.length) return;
  const key = currentPeriodKey(events, NOW);
  assert.ok(key && /regular-w1$/.test(key), `current period must be regular w1, got ${key}`);
});

// ── FIXTURE · dimension separation cannot collapse ──────────────────────────────────────────────

test("periodCounts never counts a missed or unsupported event as published", () => {
  const mk = (model, prices = "NOT_CAPTURED") => ({
    eventId: "x", providerAliases: [], sport: "mlb", competition: "MLB", season: null, phase: null,
    period: { kind: "day", key: "d", label: "d" }, scheduledUtc: null, eventEtDate: null,
    participants: { home: null, away: null }, status: "SCHEDULED",
    dimensions: { schedule: "CAPTURED", model, prices, settlement: "NOT_APPLICABLE" }, reportHref: null,
  });
  const c = periodCounts([mk("PUBLISHED"), mk("MISSED_PREEVENT"), mk("UNSUPPORTED"), mk("NOT_PUBLISHED", "PRICED")]);
  assert.deepEqual(c, { scheduled: 4, modelPublished: 1, missedPreEvent: 1, unsupported: 1, pricedNow: 1, settled: 0 });
});
