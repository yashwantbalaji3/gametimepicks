/**
 * Tests for the FIXTURE-ONLY event-market snapshot archive (Phase 14). Proves four things: (a) fixture-only — no live
 * network path is exercised or even present; (b) archived records are immutable; (c) snapshot integrity + round-trip;
 * (d) missing fields are preserved honestly (null, never faked). EXACTLY 11 tests.
 *
 * Run: npx tsx --test src/lib/event-markets/snapshot-archive.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SNAPSHOT_ARCHIVE_SCHEMA_VERSION,
  LIVE_CAPTURE_SUPPORTED,
  ARCHIVE_FIXTURE_FLAGS,
  archiveSnapshot,
  archiveSeries,
  buildSnapshotIndex,
  computeIntegrityHash,
  verifyIntegrity,
  serializeArchivedSnapshot,
  deserializeArchivedSnapshot,
  FixtureOnlyViolationError,
  SnapshotIntegrityError,
} from "./snapshot-archive.ts";
import { FIXTURE_SNAPSHOT_T1, FIXTURE_SNAPSHOT_T2, FIXTURE_SNAPSHOT_SPARSE, FIXTURE_SNAPSHOT_SERIES } from "./fixtures/snapshot-archive-samples.ts";

const FIXTURE_PROV = { origin: "fixture", archivedAt: "2026-07-23T00:00:00Z" };
const archiveT1 = () => archiveSnapshot(FIXTURE_SNAPSHOT_T1, FIXTURE_PROV);

// ── (a) fixture-only: no live network path is exercised ───────────────────────────────────────────────────────────

test("1 · fixture-only · the archive self-declares OFFLINE (LIVE_CAPTURE_SUPPORTED false + fixture flags)", () => {
  assert.equal(LIVE_CAPTURE_SUPPORTED, false);
  assert.equal(ARCHIVE_FIXTURE_FLAGS.live, false);
  assert.equal(ARCHIVE_FIXTURE_FLAGS.fixtureOnly, true);
  assert.equal(ARCHIVE_FIXTURE_FLAGS.networkAccess, false);
  assert.equal(ARCHIVE_FIXTURE_FLAGS.public, false);
});

test("2 · fixture-only · the module source imports NO network module and makes no live call", () => {
  const src = readFileSync(new URL("./snapshot-archive.ts", import.meta.url), "utf8");
  // every import specifier must be in the offline allowlist
  const allow = new Set(["node:crypto", "./types"]);
  const specifiers = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
  assert.ok(specifiers.length > 0, "sanity: the module has imports");
  for (const s of specifiers) assert.ok(allow.has(s), `unexpected import "${s}" — only offline modules are allowed`);
  // no network primitives / clients anywhere
  for (const bad of ["node:http", "node:https", "node:net", "node:dgram", "node:dns", "node:tls", "undici", "axios", "node-fetch", "XMLHttpRequest", "WebSocket"]) {
    assert.ok(!src.includes(bad), `network primitive "${bad}" must not appear`);
  }
  assert.ok(!/\bfetch\s*\(/.test(src), "no fetch() call");
  assert.ok(!/\bimport\s*\(/.test(src), "no dynamic import()");
});

test("3 · fixture-only · a non-fixture origin is REJECTED (there is no live capture path)", () => {
  assert.throws(() => archiveSnapshot(FIXTURE_SNAPSHOT_T1, { origin: "live", archivedAt: "2026-07-23T00:00:00Z" }), FixtureOnlyViolationError);
  assert.throws(() => archiveSnapshot(FIXTURE_SNAPSHOT_T1, { origin: "network", archivedAt: "2026-07-23T00:00:00Z" }), /FIXTURE-ONLY/);
});

// ── (b) snapshot immutability ─────────────────────────────────────────────────────────────────────────────────────

test("4 · immutability · an archived record is deep-frozen (top-level + nested writes throw)", () => {
  const rec = archiveT1();
  assert.ok(Object.isFrozen(rec) && Object.isFrozen(rec.snapshot) && Object.isFrozen(rec.snapshot.outcomePrices));
  assert.throws(() => { rec.integrityHash = "tampered"; }, TypeError);
  assert.throws(() => { rec.snapshot.volume = 1; }, TypeError);
  assert.throws(() => { rec.snapshot.outcomePrices.yes = 0.99; }, TypeError);
});

test("5 · immutability · mutating the caller's snapshot AFTER archiving never alters the archived copy", () => {
  const mutable = { ...FIXTURE_SNAPSHOT_T1, outcomePrices: { ...FIXTURE_SNAPSHOT_T1.outcomePrices } };
  const rec = archiveSnapshot(mutable, FIXTURE_PROV);
  mutable.outcomePrices.yes = 0.01; // mutate the source object after capture
  mutable.volume = -1;
  assert.equal(rec.snapshot.outcomePrices.yes, 0.61, "archived copy is isolated from the caller's later mutation");
  assert.equal(rec.snapshot.volume, 88000);
  assert.equal(verifyIntegrity(rec).valid, true);
});

// ── (c) snapshot integrity + round-trip ───────────────────────────────────────────────────────────────────────────

test("6 · integrity · hash is a deterministic 64-char sha256 hex, independent of outcomePrices key order", () => {
  const h1 = computeIntegrityHash(FIXTURE_SNAPSHOT_T1);
  const reordered = { ...FIXTURE_SNAPSHOT_T1, outcomePrices: { no: 0.39, yes: 0.61 } }; // same data, different key order
  const h2 = computeIntegrityHash(reordered);
  assert.equal(h1, h2, "key order must not change the hash");
  assert.equal(h1.length, 64);
  assert.match(h1, /^[0-9a-f]{64}$/);
  assert.notEqual(h1, computeIntegrityHash(FIXTURE_SNAPSHOT_T2), "different data ⇒ different hash");
});

test("7 · integrity · a freshly archived record verifies", () => {
  const check = verifyIntegrity(archiveT1());
  assert.equal(check.valid, true);
  assert.match(check.reason, /verified/);
});

test("8 · integrity · a tampered payload FAILS verification (price or source altered)", () => {
  const rec = archiveT1();
  const tamperedPrice = JSON.parse(serializeArchivedSnapshot(rec));
  tamperedPrice.snapshot.outcomePrices.yes = 0.95;
  const r1 = verifyIntegrity(tamperedPrice);
  assert.equal(r1.valid, false);
  assert.match(r1.reason, /integrity hash mismatch/);
  const tamperedSource = JSON.parse(serializeArchivedSnapshot(rec));
  tamperedSource.snapshot.source = "polymarket";
  assert.equal(verifyIntegrity(tamperedSource).valid, false);
});

test("9 · round-trip · serialize → deserialize reproduces an equal, verified record; tampered JSON throws", () => {
  const rec = archiveT1();
  const back = deserializeArchivedSnapshot(serializeArchivedSnapshot(rec));
  assert.deepEqual(back, rec);
  assert.equal(verifyIntegrity(back).valid, true);
  assert.equal(back.integrityHash, rec.integrityHash);
  const tampered = JSON.parse(serializeArchivedSnapshot(rec));
  tampered.snapshot.liquidity = 999999;
  assert.throws(() => deserializeArchivedSnapshot(JSON.stringify(tampered)), SnapshotIntegrityError);
});

// ── (d) honest handling of missing fields ─────────────────────────────────────────────────────────────────────────

test("10 · missing fields · null volume/liquidity + absent bidAsk are preserved honestly (never faked)", () => {
  const rec = archiveSnapshot(FIXTURE_SNAPSHOT_SPARSE, FIXTURE_PROV);
  assert.equal(rec.snapshot.volume, null, "unknown volume stays null (not 0)");
  assert.equal(rec.snapshot.liquidity, null, "unknown liquidity stays null (not 0)");
  assert.equal("bidAsk" in rec.snapshot, false, "absent bidAsk stays absent (not fabricated)");
  assert.equal(verifyIntegrity(rec).valid, true);
  // null must NOT hash the same as a fabricated 0 — honesty is load-bearing in the integrity hash
  const faked = { ...FIXTURE_SNAPSHOT_SPARSE, volume: 0, liquidity: 0 };
  assert.notEqual(computeIntegrityHash(FIXTURE_SNAPSHOT_SPARSE), computeIntegrityHash(faked));
});

// ── forward-only series + index (ties the pattern together) ───────────────────────────────────────────────────────

test("11 · series · archiveSeries is forward-only (dedupes duplicate capture time) + ordered; index is ordered; records are fixture-stamped", () => {
  const withDup = [...FIXTURE_SNAPSHOT_SERIES, FIXTURE_SNAPSHOT_T1]; // a re-offered capture must not overwrite
  const records = archiveSeries(withDup, FIXTURE_PROV);
  assert.equal(records.length, 3, "the duplicate (marketId, capturedAt) is dropped, not overwritten");
  const times = records.map((r) => r.capturedAt);
  assert.deepEqual(times, [...times].sort((a, b) => a.localeCompare(b)), "ordered by capturedAt");
  for (const r of records) {
    assert.equal(r.fixtureOnly, true);
    assert.equal(r.schemaVersion, SNAPSHOT_ARCHIVE_SCHEMA_VERSION);
    assert.equal(verifyIntegrity(r).valid, true);
  }
  const index = buildSnapshotIndex(records);
  assert.equal(index.length, 1, "one market");
  assert.deepEqual(index[0].capturedAts, times, "index lists the ordered capture times");
});
