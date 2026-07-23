/**
 * NBA immutable pregame-snapshot contract tests (Phase 12). Deterministic, no clock, no network. Pins the three
 * rules: (1) research-eligible only when every USED input is provably available before tip-off, (2) snapshots are
 * immutable, (3) a late update creates a NEW cadence snapshot that supersedes — never overwrites — an earlier one.
 * Run: npx tsx --test src/lib/nba/pregame-snapshot-contract.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  createSnapshot,
  snapshotEligibility,
  appendCadenceSnapshot,
  latestEligibleSnapshot,
  computeProvenanceHash,
  deterministicHash,
  NBA_SNAPSHOT_FIELD_CATALOG,
  NBA_CONTRACT_FLAGS,
  NBA_PREGAME_SNAPSHOT_SCHEMA_VERSION,
} from "./pregame-snapshot-contract.ts";

// Real 2026-06-13 slate: 8:30 PM ET tip-off = 2026-06-14T00:30:00Z.
const TIP = "2026-06-14T00:30:00Z";
const PRETIP = "2026-06-13T15:17:23Z"; // real board generatedAt (11:17 AM ET)

const field = (over) => ({
  family: "markets",
  key: "market_line",
  value: { line: 8.5, oddsOver: -120, oddsUnder: 100 },
  capturedAt: PRETIP,
  availableAt: PRETIP,
  timestampProven: true,
  used: true,
  ...over,
});

test("catalog · enumerates the exact candidate fields incl. the MISSING reactivation gaps", () => {
  const keys = NBA_SNAPSHOT_FIELD_CATALOG.map((f) => f.key);
  for (const k of ["schedule", "active_roster", "injury_status", "projected_starters", "confirmed_starters", "expected_minutes", "market_line", "team_total", "spread", "pace", "rest_days", "back_to_back", "role_usage"]) {
    assert.ok(keys.includes(k), `catalog must include ${k}`);
  }
  // expected_minutes / starters / pace / rest are documented as NOT present in the historical pipeline.
  const em = NBA_SNAPSHOT_FIELD_CATALOG.find((f) => f.key === "expected_minutes");
  assert.equal(em.presentInHistorical, false);
});

test("eligibility · all used inputs pre-tip with proven timestamps ⇒ eligible", () => {
  const snap = createSnapshot({ gameKey: "espn:401859967", playerKey: "bridges-mikal", reason: "BOARD_GENERATION", tipoffTime: TIP, capturedAt: PRETIP, fields: [field()] });
  const r = snapshotEligibility(snap);
  assert.equal(r.eligible, true, r.reason);
  assert.equal(r.quality, "COMPLETE");
});

test("eligibility · display-only tip-off ⇒ TIMESTAMP_UNPROVEN (the historical-board reality)", () => {
  const snap = createSnapshot({ gameKey: "espn:401859967", playerKey: "p", reason: "BOARD_GENERATION", tipoffTime: "8:30 PM ET", capturedAt: PRETIP, fields: [field()] });
  const r = snapshotEligibility(snap);
  assert.equal(r.eligible, false);
  assert.equal(r.quality, "TIMESTAMP_UNPROVEN");
});

test("eligibility · a USED input available only at/after tip-off ⇒ ineligible (POST_TIP_ONLY)", () => {
  const late = field({ key: "injury_status", family: "injury_status", value: "OUT", capturedAt: "2026-06-14T01:00:00Z", availableAt: "2026-06-14T01:00:00Z" });
  const snap = createSnapshot({ gameKey: "g", playerKey: "p", reason: "INJURY_UPDATE", tipoffTime: TIP, capturedAt: PRETIP, fields: [field(), late] });
  const r = snapshotEligibility(snap);
  assert.equal(r.eligible, false);
  assert.equal(r.quality, "POST_TIP_ONLY");
  assert.deepEqual(r.offendingFields, ["injury_status"]);
});

test("eligibility · the SAME late field, if UNUSED, does NOT block eligibility", () => {
  const lateUnused = field({ key: "injury_status", family: "injury_status", value: "OUT", capturedAt: "2026-06-14T01:00:00Z", availableAt: "2026-06-14T01:00:00Z", used: false });
  const snap = createSnapshot({ gameKey: "g", playerKey: "p", reason: "BOARD_GENERATION", tipoffTime: TIP, capturedAt: PRETIP, fields: [field(), lateUnused] });
  assert.equal(snapshotEligibility(snap).eligible, true, "only USED inputs gate eligibility");
});

test("eligibility · a used input with an unproven source timestamp ⇒ TIMESTAMP_UNPROVEN", () => {
  const snap = createSnapshot({ gameKey: "g", playerKey: "p", reason: "BOARD_GENERATION", tipoffTime: TIP, capturedAt: PRETIP, fields: [field({ timestampProven: false })] });
  const r = snapshotEligibility(snap);
  assert.equal(r.eligible, false);
  assert.equal(r.quality, "TIMESTAMP_UNPROVEN");
});

test("immutability · a created snapshot (and its fields) is deep-frozen; mutation throws", () => {
  const snap = createSnapshot({ gameKey: "g", playerKey: "p", reason: "BOARD_GENERATION", tipoffTime: TIP, capturedAt: PRETIP, fields: [field()] });
  assert.equal(Object.isFrozen(snap), true);
  assert.equal(Object.isFrozen(snap.fields), true);
  assert.equal(Object.isFrozen(snap.fields[0]), true);
  assert.throws(() => {
    snap.reason = "INJURY_UPDATE";
  }, TypeError);
  assert.throws(() => {
    snap.fields[0].value = "tampered";
  }, TypeError);
  assert.equal(snap.reason, "BOARD_GENERATION", "value unchanged after tamper attempt");
});

test("late update · creates a NEW cadence snapshot that supersedes — the earlier eligible snapshot is untouched", () => {
  const first = createSnapshot({ gameKey: "g", playerKey: "p", reason: "BOARD_GENERATION", tipoffTime: TIP, capturedAt: PRETIP, fields: [field()] });
  assert.equal(snapshotEligibility(first).eligible, true);

  // A pre-tip injury downgrade arrives later in the day (still before tip-off).
  const injury = field({ key: "injury_status", family: "injury_status", value: "QUESTIONABLE", capturedAt: "2026-06-13T22:00:00Z", availableAt: "2026-06-13T22:00:00Z" });
  const second = appendCadenceSnapshot(first, { gameKey: "g", playerKey: "p", reason: "INJURY_UPDATE", tipoffTime: TIP, capturedAt: "2026-06-13T22:05:00Z", fields: [field(), injury] });

  assert.equal(second.supersedes, first.provenanceHash, "new snapshot points back at the prior one");
  assert.equal(second.cadenceIndex, first.cadenceIndex + 1);
  assert.notEqual(second.provenanceHash, first.provenanceHash, "distinct provenance");
  // The FIRST snapshot is unchanged and still eligible — nothing was overwritten.
  assert.equal(first.cadenceIndex, 0);
  assert.equal(first.fields.length, 1);
  assert.equal(snapshotEligibility(first).eligible, true);
  assert.equal(snapshotEligibility(second).eligible, true);
  // The authoritative snapshot for research is the latest eligible one.
  assert.equal(latestEligibleSnapshot([first, second]).provenanceHash, second.provenanceHash);
});

test("provenance hash · deterministic on identical inputs; sensitive to used-value changes; ignores unused", () => {
  const base = { gameKey: "g", playerKey: "p", reason: "BOARD_GENERATION", tipoffTime: TIP, capturedAt: PRETIP, cadenceIndex: 0 };
  const h1 = computeProvenanceHash({ ...base, fields: [field()] });
  const h2 = computeProvenanceHash({ ...base, fields: [field()] });
  assert.equal(h1, h2, "same inputs → same hash");
  const h3 = computeProvenanceHash({ ...base, fields: [field({ value: { line: 9.5 } })] });
  assert.notEqual(h1, h3, "changed used value → different hash");
  const h4 = computeProvenanceHash({ ...base, fields: [field(), field({ key: "pace", family: "team_context", value: 99, used: false })] });
  assert.equal(h1, h4, "adding an UNUSED field does not change provenance");
  assert.match(deterministicHash("abc"), /^[0-9a-f]{8}$/);
});

test("contract flags + schema version pinned; HISTORICAL_ONLY", () => {
  assert.equal(NBA_PREGAME_SNAPSHOT_SCHEMA_VERSION, "nba-pregame-snapshot-1");
  assert.equal(NBA_CONTRACT_FLAGS.public, false);
  assert.equal(NBA_CONTRACT_FLAGS.approvedForProduction, false);
  assert.equal(NBA_CONTRACT_FLAGS.productEligible, false);
});
