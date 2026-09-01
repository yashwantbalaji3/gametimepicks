/**
 * The offered-window control plane — precedence, conservation, and the corruptions it must catch.
 *
 * Run: npx tsx --test src/lib/offered-window/offered-window.test.mjs
 *
 * Every surface used to answer "what is offered right now" from its own artifact, and each was right
 * about its artifact and wrong about the platform. The recurring shape was never disagreement about
 * numbers: it was that "we have no card", "no card was offered" and "we could not look" all rendered
 * as the same quiet zero.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  OFFERED_STATES,
  classifyEvent,
  startedBy,
  buildSportWindow,
  worstWindowState,
  publicSummary,
} from "./offered-window.mjs";

const NOW = Date.parse("2026-09-01T12:00:00Z");
const FUTURE = "2026-09-05T19:00:00Z";
const PAST = "2026-08-29T19:00:00Z";

const ev = (o = {}) => ({
  sport: "ufc", providerEventId: "1", canonicalId: "ufc-1", startUtc: FUTURE, nowMs: NOW,
  joined: true, sourceAgeHours: 1, maxSourceAgeHours: 72,
  offered: false, priced: false, forecast: false, published: false, refusalReason: null, settled: false,
  ...o,
});

/* ── THE LADDER ────────────────────────────────────────────────────────────────────────────────── */

test("each stage of evidence produces its own state", () => {
  assert.equal(classifyEvent(ev()).state, "NOT_OFFERED");
  assert.equal(classifyEvent(ev({ offered: true })).state, "OFFERED_UNPRICED");
  assert.equal(classifyEvent(ev({ offered: true, priced: true })).state, "OFFERED_PRICED");
  assert.equal(classifyEvent(ev({ priced: true, forecast: true })).state, "FORECAST_READY");
  assert.equal(classifyEvent(ev({ forecast: true, published: true })).state, "PUBLISHED");
  assert.equal(classifyEvent(ev({ refusalReason: "no eligible price" })).state, "REFUSED");
  assert.equal(classifyEvent(ev({ startUtc: PAST })).state, "STARTED");
  assert.equal(classifyEvent(ev({ startUtc: PAST, settled: true })).state, "SETTLED");
});

test("PRECEDENCE · a failure outranks every stage that also matched", () => {
  /*
   * The masking this ordering prevents. A UFC odds capture describing a card that had already been
   * fought produced rows that ALSO satisfied "published" — and reporting the later stage would have
   * dressed a rotten source as a healthy window.
   */
  const stale = classifyEvent(ev({ published: true, forecast: true, priced: true, sourceAgeHours: 96, maxSourceAgeHours: 72 }));
  assert.equal(stale.state, "SOURCE_STALE");
  assert.match(stale.reason, /96\.0h old against a 72h bound/);

  const unjoined = classifyEvent(ev({ joined: false, published: true, settled: true }));
  assert.equal(unjoined.state, "JOIN_FAILED", "an unjoinable row is a finding even when later evidence exists");

  // And within the healthy stages, the most terminal wins — never two states for one event.
  assert.equal(classifyEvent(ev({ startUtc: PAST, settled: true, published: true, priced: true })).state, "SETTLED");
});

test("REFUSAL · an unreadable start time counts as STARTED — the error that cannot be undone", () => {
  assert.equal(startedBy(null, NOW), true);
  assert.equal(startedBy("not-a-date", NOW), true);
  assert.equal(startedBy(FUTURE, NOW), false);
  assert.equal(startedBy(PAST, NOW), true);
  assert.equal(classifyEvent(ev({ startUtc: null })).state, "STARTED", "generating for a possibly-live event is unrecoverable");
});

test('"WE NEVER ASKED" IS NOT "THERE IS NOTHING THERE"', () => {
  /*
   * The distinction that changed two sports' verdicts. NFL's newest market capture was stamped
   * 08-29 with one event — CHI @ TEN, since played and settled — and the only scheduled game had
   * never been probed. Reporting it NOT_OFFERED asserts something about the PROVIDER that the
   * evidence only supports about US. EPL was the same shape: an 08-30 odds snapshot cannot have
   * probed a 09-04 fixture whose market had not opened.
   */
  const neverAsked = classifyEvent(ev({ captured: false, captureDueReason: "the newest capture does not name this event" }));
  assert.equal(neverAsked.state, "NOT_YET_CAPTURED");
  assert.match(neverAsked.reason, /does not name this event/);

  // Only a caller that HAS captured may make the claim about the provider.
  assert.equal(classifyEvent(ev({ captured: true })).state, "NOT_OFFERED");
  assert.equal(classifyEvent(ev()).state, "NOT_OFFERED", "an unstated capture flag keeps the prior behaviour");
});

test("NOT_YET_CAPTURED is AWAITED, not owed — and never outranks real evidence", () => {
  const w = buildSportWindow({
    sport: "mlb", horizonHours: 48, nowMs: NOW,
    events: [ev({ canonicalId: "a", captured: false }), ev({ canonicalId: "b", priced: true }), ev({ canonicalId: "c", captured: false })],
  });
  assert.equal(w.counts.NOT_YET_CAPTURED, 2);
  assert.deepEqual(w.awaited.map((r) => r.canonicalId).sort(), ["a", "c"]);
  assert.deepEqual(w.owed.map((r) => r.canonicalId), ["b"], "an uncaptured event is not a debt until its capture is due");

  // Evidence we DO have always wins over "not captured".
  for (const extra of [{ offered: true }, { priced: true }, { forecast: true }, { published: true }, { settled: true }]) {
    assert.notEqual(classifyEvent(ev({ captured: false, ...extra })).state, "NOT_YET_CAPTURED");
  }
});

/* ── CONSERVATION ──────────────────────────────────────────────────────────────────────────────── */

test("every event appears exactly once, and the counts sum to the population", () => {
  const w = buildSportWindow({
    sport: "ufc", horizonHours: 336, nowMs: NOW,
    events: [ev(), ev({ offered: true }), ev({ priced: true, forecast: true }), ev({ startUtc: PAST, settled: true })],
  });
  assert.equal(w.population, 4);
  assert.equal(Object.values(w.counts).reduce((a, b) => a + b, 0), 4);
  assert.equal(w.conserved, true);
  assert.equal(w.rows.length, 4);
  for (const r of w.rows) assert.ok(OFFERED_STATES.includes(r.state), `${r.state} outside the closed vocabulary`);
});

test("WORK_OWED names what the pipeline still owes, by identity", () => {
  const w = buildSportWindow({
    sport: "ufc", horizonHours: 336, nowMs: NOW,
    events: [ev({ canonicalId: "ufc-a", priced: true }), ev({ canonicalId: "ufc-b", priced: true, forecast: true }), ev({ canonicalId: "ufc-c" })],
  });
  assert.equal(w.state, "WORK_OWED");
  assert.deepEqual(w.owed.map((r) => r.canonicalId).sort(), ["ufc-a", "ufc-b"]);
  // NOT_OFFERED is evidence, not a debt — the provider simply lists nothing.
  assert.ok(!w.owed.some((r) => r.canonicalId === "ufc-c"));
});

test("REFUSAL · an empty window is NO_EVENTS and an unreadable one is UNKNOWN — neither is COMPLETE", () => {
  assert.equal(buildSportWindow({ sport: "nfl", events: [], horizonHours: 336, nowMs: NOW }).state, "NO_EVENTS");
  const unknown = buildSportWindow({ sport: "epl", events: [], horizonHours: 336, nowMs: NOW, readable: false });
  assert.equal(unknown.state, "UNKNOWN");
  assert.deepEqual(unknown.awaited, [], "the unreadable shape carries every field a caller reads");
  assert.match(unknown.note, /not the same as nothing scheduled/);
  assert.equal(worstWindowState(["COMPLETE", "NO_EVENTS", "UNKNOWN"]), "UNKNOWN", "not knowing outranks every known state");
  assert.equal(worstWindowState(["COMPLETE", "WORK_OWED", "FINDINGS"]), "FINDINGS");
});

/* ── THE CORRUPTIONS THE CHARTER NAMES ─────────────────────────────────────────────────────────── */

test("CORRUPTION · a duplicate provider id is visible in the matrix rather than collapsing a row", () => {
  const w = buildSportWindow({
    sport: "mlb", horizonHours: 48, nowMs: NOW,
    events: [ev({ sport: "mlb", providerEventId: "7", canonicalId: "mlb-7" }), ev({ sport: "mlb", providerEventId: "7", canonicalId: "mlb-7" })],
  });
  assert.equal(w.population, 2, "two rows in, two rows out — a matrix that silently dedupes cannot be reconciled");
  const ids = w.rows.map((r) => r.providerEventId);
  assert.deepEqual(ids, ["7", "7"], "the duplication is preserved for the identity audit to name");
});

test("CORRUPTION · a forecast produced after the start is STARTED, never FORECAST_READY", () => {
  const late = classifyEvent(ev({ startUtc: PAST, forecast: true, priced: true }));
  assert.equal(late.state, "STARTED");
  assert.match(late.reason, /nothing new may be generated/);
});

test("CORRUPTION · stale acquisition beats a price that looks current", () => {
  assert.equal(classifyEvent(ev({ priced: true, offered: true, sourceAgeHours: 200, maxSourceAgeHours: 72 })).state, "SOURCE_STALE");
});

test("DETERMINISM · same inputs and pinned clock produce identical bytes", () => {
  const events = [ev({ canonicalId: "a", priced: true }), ev({ canonicalId: "b" }), ev({ canonicalId: "c", startUtc: PAST, settled: true })];
  const a = buildSportWindow({ sport: "ufc", events, horizonHours: 336, nowMs: NOW });
  const b = buildSportWindow({ sport: "ufc", events: [...events], horizonHours: 336, nowMs: NOW });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

/* ── THE PUBLIC/PRIVATE BOUNDARY ───────────────────────────────────────────────────────────────── */

test("the public summary carries COUNTS ONLY — never a route, receipt, price or identity", () => {
  const w = buildSportWindow({
    sport: "ufc", horizonHours: 336, nowMs: NOW,
    events: [ev({ canonicalId: "ufc-secret", publicRoute: "/internal/x", acquisitionAt: "2026-09-01T00:00:00Z", priced: true })],
  });
  const blob = JSON.stringify(publicSummary([w]));
  assert.doesNotMatch(blob, /ufc-secret/, "no identity leaks into the public summary");
  assert.doesNotMatch(blob, /acquisitionAt|publicRoute|sourceAgeHours|reason/, "no receipt, route or freshness leaks either");
  assert.match(blob, /"events":1/);
});

/* ── AGAINST THE COMMITTED MATRIX ──────────────────────────────────────────────────────────────── */

test("LIVE · the committed matrix conserves, covers five sports, and stays inside the vocabulary", () => {
  const dir = path.join(process.cwd(), "..", "data", "internal", "offered-window");
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (files.length === 0) return;
  const m = JSON.parse(fs.readFileSync(path.join(dir, files.at(-1)), "utf8"));

  const sports = m.sports.map((s) => s.sport);
  for (const s of ["mlb", "nfl", "ufc", "epl", "nba"]) {
    assert.ok(sports.includes(s), `${s} is missing from the matrix — a sport absent from the table reads as an oversight`);
  }
  for (const s of m.sports) {
    assert.equal(s.conserved, true, `${s.sport}: the matrix does not reconcile`);
    assert.equal(Object.values(s.counts).reduce((a, b) => a + b, 0), s.population, `${s.sport}: counts do not sum to the population`);
    for (const r of s.rows) assert.ok(OFFERED_STATES.includes(r.state), `${s.sport}: ${r.state} outside the vocabulary`);
  }
});

test("LIVE · the PUBLIC artifact never carries the private matrix", () => {
  const pub = path.join(process.cwd(), "public", "data", "ops", "offered-window.json");
  if (!fs.existsSync(pub)) return;
  const blob = fs.readFileSync(pub, "utf8");
  for (const leaked of ["acquisitionAt", "publicRoute", "forecastRevision", "settlementId", "sourceAgeHours", "\"rows\""]) {
    assert.ok(!blob.includes(leaked), `the public summary carries "${leaked}" — that belongs to the private matrix`);
  }
});
