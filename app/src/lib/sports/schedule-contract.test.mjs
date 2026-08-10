/**
 * Schedule-contract guards (Program 148 · Release A).
 *
 * Every fixture below is a failure this repository has already paid for in one sport, generalized:
 * doubleheader identity collisions, "Final" strings that lie, snapshots claiming to know the
 * future, aliases silently minting duplicate identities. The contract must refuse each of them for
 * EVERY sport, before any adapter exists to get them wrong.
 *
 * Run: npx tsx --test src/lib/sports/schedule-contract.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SCHEDULE_CONTRACT_VERSION, EVENT_STATUS, UFC_BOUT_STATUS_EXT, COVERAGE_STATES,
  normalizeEventStatus, canonicalEventId, validateEvent, classifySnapshotFreshness, resolveAlias,
} from "./schedule-contract.mjs";
import { SOURCES, authorizedForPublicDisplay, sourcesFor } from "./source-registry.mjs";

const EVENT = (over = {}) => ({
  schemaVersion: SCHEDULE_CONTRACT_VERSION,
  sport: "epl", competition: "premier-league", season: "2026-27",
  providerEventId: "fx-1001",
  canonicalEventId: "epl:premier-league:2026-08-15:fx-1001",
  scheduledStartUtc: "2026-08-15T14:00:00Z",
  status: "SCHEDULED",
  competitors: { home: { id: "t-ars", name: "Arsenal" }, away: { id: "t-liv", name: "Liverpool" } },
  fetchedAt: "2026-08-09T12:00:00Z", sourceAsOf: "2026-08-09T11:58:00Z",
  provenance: "api_football fixtures endpoint",
  ...over,
});

test("THE DOUBLEHEADER LESSON · canonical identity requires the provider event id", () => {
  assert.equal(canonicalEventId({ sport: "mlb", competition: "regular", dateEt: "2026-08-09", providerEventId: "745123" }),
    "mlb:regular:2026-08-09:745123");
  assert.throws(() => canonicalEventId({ sport: "mlb", competition: "regular", dateEt: "2026-08-09", providerEventId: "" }), /providerEventId is required/);
  assert.throws(() => canonicalEventId({ sport: "mlb", competition: "regular", dateEt: "Aug 9", providerEventId: "x" }), /YYYY-MM-DD/);
});

test("the status taxonomy is CLOSED — unmapped provider strings become UNKNOWN, never guessed", () => {
  assert.equal(normalizeEventStatus("epl", "FT"), "FINAL");
  assert.equal(normalizeEventStatus("epl", "PST"), "POSTPONED");
  assert.equal(normalizeEventStatus("epl", "weird_new_string"), "UNKNOWN");
  assert.equal(normalizeEventStatus("cricket", "final"), "UNKNOWN", "an unregistered sport maps nothing");
  for (const s of EVENT_STATUS) assert.ok(typeof s === "string");
});

test("UFC's bout lifecycle is an EXTENSION, not a corruption of the shared taxonomy", () => {
  for (const s of UFC_BOUT_STATUS_EXT) assert.ok(!EVENT_STATUS.includes(s), `${s} must not leak into the shared enum`);
  assert.equal(validateEvent(EVENT({ status: "NO_CONTEST", competitors: { red: { id: "f1" }, blue: { id: "f2" } } })).ok, true,
    "a UFC extension status validates through the same contract");
});

test("competitors: exactly one role scheme — home/away or red/blue, never both, never neither", () => {
  assert.equal(validateEvent(EVENT()).ok, true);
  assert.equal(validateEvent(EVENT({ competitors: {} })).ok, false);
  const mixed = validateEvent(EVENT({ competitors: { home: { id: "a" }, away: { id: "b" }, red: { id: "c" }, blue: { id: "d" } } }));
  assert.equal(mixed.ok, false);
  assert.ok(mixed.errors.some((e) => /mix role schemes/.test(e)));
});

test("THE POINT-IN-TIME RULE · a snapshot cannot claim to be newer than its fetch", () => {
  const bad = validateEvent(EVENT({ sourceAsOf: "2026-08-09T13:00:00Z", fetchedAt: "2026-08-09T12:00:00Z" }));
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => /cannot know the future/.test(e)));
});

test("validateEvent is total — a garbage record returns errors, never throws mid-batch", () => {
  const r = validateEvent({});
  assert.equal(r.ok, false);
  assert.ok(r.errors.length >= 5);
});

test("freshness classifies FRESH/STALE/UNKNOWN and never goes negative-fresh", () => {
  assert.equal(classifySnapshotFreshness({ fetchedAt: "2026-08-09T00:00:00Z", nowIso: "2026-08-09T10:00:00Z" }), "FRESH");
  assert.equal(classifySnapshotFreshness({ fetchedAt: "2026-08-07T00:00:00Z", nowIso: "2026-08-09T10:00:00Z" }), "STALE");
  assert.equal(classifySnapshotFreshness({ fetchedAt: "2026-08-10T00:00:00Z", nowIso: "2026-08-09T10:00:00Z" }), "UNKNOWN", "a future fetch is nonsense, not fresh");
  assert.equal(classifySnapshotFreshness({}), "UNKNOWN");
});

test("THE COLLISION LESSON · unknown aliases quarantine, never silently mint identities", () => {
  const map = { "arsenal": "t-ars", "arsenal fc": "t-ars" };
  assert.deepEqual(resolveAlias(map, "  Arsenal  FC "), { ok: true, canonicalId: "t-ars" });
  const q = resolveAlias(map, "Arsenal Football Club");
  assert.equal(q.ok, false);
  assert.match(q.quarantine.reason, /never auto-mint/);
  assert.equal(resolveAlias(map, "").ok, false);
});

test("coverage state is a separate axis with SCHEDULE_ONLY as a legitimate public state", () => {
  assert.ok(COVERAGE_STATES.includes("SCHEDULE_ONLY"));
  assert.ok(COVERAGE_STATES.includes("SOURCE_STALE"));
  assert.ok(COVERAGE_STATES.includes("OFF_SEASON"));
  // And no coverage state shares a name with an event status — the axes must be unmistakable.
  for (const c of COVERAGE_STATES) assert.ok(!EVENT_STATUS.includes(c), `${c} collides with an event status`);
});

test("the source registry records rights + authorization for every source, and balldontlie stays research-only", () => {
  for (const [id, s] of Object.entries(SOURCES)) {
    for (const k of ["owner", "cost", "credentials", "terms", "authorization", "sports", "roles", "failureBehavior"]) {
      assert.ok(s[k] != null && String(s[k]).length > 0, `${id}.${k} must be recorded`);
    }
    assert.ok(["PUBLIC_DISPLAY", "PRIVATE_RESEARCH", "BLOCKED"].includes(s.authorization));
  }
  assert.equal(authorizedForPublicDisplay("mlb_statsapi"), true);
  assert.equal(authorizedForPublicDisplay("balldontlie"), false, "failing provider tests ⇒ research-only until fixed");
  // Selection prefers public-authorized sources.
  const epl = sourcesFor("epl", "schedule-candidate");
  assert.ok(epl.length >= 1 && epl[0].authorization === "PUBLIC_DISPLAY");
});

test("no source is invented — the registry covers exactly the providers this repo already touches", () => {
  // Additions must name their first real use: openfootball (Release C, EPL research corpus) and
  // espn_scoreboard (Release B/D, first NFL preseason capture) joined in Program 148.
  assert.deepEqual(Object.keys(SOURCES).sort(),
    ["api_football", "balldontlie", "espn_cdn", "espn_scoreboard", "mlb_midfield", "mlb_statsapi", "odds_api", "openfootball"]);
});
