/**
 * EVENT-MARKET SNAPSHOT ARCHIVE (Phase 14) — fixture-only, immutable, forward-only snapshot capture.
 *
 * Analogous to the MLB pregame research archive's immutable-snapshot pattern
 * (app/src/lib/mlb/pregame-archive/eligibility.ts): a value is captured once, stamped with provenance, hashed for
 * integrity, and NEVER backfilled or overwritten. This module differs in one hard way — it is OFFLINE BY
 * CONSTRUCTION: it performs no network I/O and has no live-capture code path. It archives `MarketSnapshot` objects
 * that originate from FIXTURES only. A snapshot whose provenance origin is not `"fixture"` is REJECTED, so there is
 * no way for a live/remote payload to enter the archive through this module.
 *
 * Honesty rules (mirrored from the rest of event-markets):
 *   - Fields a snapshot does not carry stay `null` / absent — never faked (null volume is NOT zero volume).
 *   - Prices stored here are the PLATFORM's implied numbers as captured; this module asserts NO independent probability.
 *   - Records are deep-frozen and integrity-hashed; a tampered payload fails verification.
 *
 * Pure + deterministic. No network, no modeling, no money, no wallet, no trading. Internal only.
 */
import crypto from "node:crypto";
import type { MarketSnapshot } from "./types";

export const SNAPSHOT_ARCHIVE_SCHEMA_VERSION = "event-market-snapshot-archive-1";

/** Live capture is NOT supported here — this archive is offline + fixture-only by construction. */
export const LIVE_CAPTURE_SUPPORTED = false as const;

/** Every archived record is internal + offline + fixture-only — never a public, live, or product surface. */
export const ARCHIVE_FIXTURE_FLAGS = { public: false, live: false, fixtureOnly: true, networkAccess: false } as const;

/** Storage layout (paths relative to data/internal/event-markets/). Raw snapshots are preserved immutably + forward-only. */
export const SNAPSHOT_ARCHIVE_LAYOUT = {
  raw: "snapshots/raw/<marketId>/<capturedAt>.json", // exactly as captured (provenance), never overwritten
  index: "snapshots/index/<marketId>.json", // marketId -> ordered [capturedAt]
} as const;

/**
 * The ONLY origin this archive accepts. There is intentionally no `"live"` / `"network"` member — the type itself
 * documents that a remote capture path does not exist in this module.
 */
export type SnapshotOrigin = "fixture";

export interface ArchiveProvenance {
  origin: SnapshotOrigin; // must be "fixture"
  archivedAt: string; // ISO — when WE wrote it into the archive
  note?: string;
}

export interface ArchivedSnapshot {
  schemaVersion: typeof SNAPSHOT_ARCHIVE_SCHEMA_VERSION;
  fixtureOnly: true;
  marketId: string;
  capturedAt: string;
  snapshot: MarketSnapshot; // the immutable captured payload (a defensive deep copy)
  provenance: ArchiveProvenance;
  integrityHash: string; // sha256 (hex) over the stable snapshot fields
}

/** Thrown when a non-fixture origin is offered — the archive never accepts a live/remote payload. */
export class FixtureOnlyViolationError extends Error {
  constructor(origin: string) {
    super(`snapshot archive is FIXTURE-ONLY: origin "${origin}" is rejected (no live/remote capture path exists)`);
    this.name = "FixtureOnlyViolationError";
  }
}

/** Thrown when an archived record's payload does not match its integrity hash (tamper / corruption). */
export class SnapshotIntegrityError extends Error {
  constructor(reason: string) {
    super(`archived snapshot failed integrity verification: ${reason}`);
    this.name = "SnapshotIntegrityError";
  }
}

/** Canonical, key-sorted stringify so the integrity hash is independent of object key order. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** Deterministic integrity hash over the identifying snapshot fields. Missing fields hash as `null` (never faked). */
export function computeIntegrityHash(snapshot: MarketSnapshot): string {
  const basis = stableStringify({
    marketId: snapshot.marketId,
    capturedAt: snapshot.capturedAt,
    outcomePrices: snapshot.outcomePrices ?? null,
    bidAsk: snapshot.bidAsk ?? null,
    volume: snapshot.volume ?? null,
    liquidity: snapshot.liquidity ?? null,
    source: snapshot.source,
  });
  return crypto.createHash("sha256").update(basis).digest("hex");
}

/** Recursively freeze so an archived record cannot be mutated after capture. */
function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
    for (const v of Object.values(obj as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(obj);
  }
  return obj;
}

/** JSON deep clone — isolates the archived copy from later caller mutation AND asserts the payload is JSON-safe. */
function jsonClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * Archive one fixture snapshot into an immutable, integrity-hashed record. Rejects any non-fixture origin. The stored
 * snapshot is a defensive deep copy, so later mutation of the caller's object never reaches the archive.
 */
export function archiveSnapshot(snapshot: MarketSnapshot, provenance: ArchiveProvenance): ArchivedSnapshot {
  if (provenance.origin !== "fixture") throw new FixtureOnlyViolationError(String((provenance as { origin?: unknown }).origin));
  if (!snapshot || typeof snapshot.marketId !== "string" || !snapshot.marketId) throw new Error("snapshot is missing marketId");
  if (typeof snapshot.capturedAt !== "string" || !snapshot.capturedAt) throw new Error("snapshot is missing capturedAt");

  const cloned = jsonClone(snapshot);
  const cleanProvenance: ArchiveProvenance =
    provenance.note !== undefined
      ? { origin: "fixture", archivedAt: provenance.archivedAt, note: provenance.note }
      : { origin: "fixture", archivedAt: provenance.archivedAt };

  const record: ArchivedSnapshot = {
    schemaVersion: SNAPSHOT_ARCHIVE_SCHEMA_VERSION,
    fixtureOnly: true,
    marketId: cloned.marketId,
    capturedAt: cloned.capturedAt,
    snapshot: cloned,
    provenance: cleanProvenance,
    integrityHash: computeIntegrityHash(cloned),
  };
  return deepFreeze(record);
}

export interface IntegrityCheck {
  valid: boolean;
  reason: string;
}

/** Recompute the integrity hash from the payload and confirm the record is a well-formed, fixture-only snapshot. */
export function verifyIntegrity(record: ArchivedSnapshot): IntegrityCheck {
  if (record.schemaVersion !== SNAPSHOT_ARCHIVE_SCHEMA_VERSION) return { valid: false, reason: "schema version mismatch" };
  if (record.fixtureOnly !== true) return { valid: false, reason: "record is not flagged fixture-only" };
  if (record.snapshot.marketId !== record.marketId) return { valid: false, reason: "marketId header/payload mismatch" };
  if (record.snapshot.capturedAt !== record.capturedAt) return { valid: false, reason: "capturedAt header/payload mismatch" };
  if (computeIntegrityHash(record.snapshot) !== record.integrityHash) return { valid: false, reason: "integrity hash mismatch (payload was altered)" };
  return { valid: true, reason: "integrity verified" };
}

/** Serialize an archived record for immutable storage (round-trips through JSON). */
export function serializeArchivedSnapshot(record: ArchivedSnapshot): string {
  return JSON.stringify(record);
}

/** Parse a stored record, VERIFY its integrity (throws on tamper/corruption), and return a frozen record. */
export function deserializeArchivedSnapshot(json: string): ArchivedSnapshot {
  const parsed = JSON.parse(json) as ArchivedSnapshot;
  const check = verifyIntegrity(parsed);
  if (!check.valid) throw new SnapshotIntegrityError(check.reason);
  return deepFreeze(parsed);
}

/**
 * Archive a series of fixture snapshots forward-only: the FIRST capture at a given (marketId, capturedAt) wins and is
 * never overwritten by a later duplicate; the result is ordered by capturedAt.
 */
export function archiveSeries(snapshots: MarketSnapshot[], provenance: ArchiveProvenance): ArchivedSnapshot[] {
  const seen = new Set<string>();
  const records: ArchivedSnapshot[] = [];
  for (const s of snapshots) {
    const rec = archiveSnapshot(s, provenance);
    const key = `${rec.marketId}::${rec.capturedAt}`;
    if (seen.has(key)) continue; // forward-only: never overwrite an existing capture
    seen.add(key);
    records.push(rec);
  }
  return records.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

/** Build the per-market ordered index of capture times (the `snapshots/index/<marketId>.json` shape). */
export function buildSnapshotIndex(records: ArchivedSnapshot[]): Array<{ marketId: string; capturedAts: string[] }> {
  const byMarket = new Map<string, string[]>();
  for (const r of records) {
    const arr = byMarket.get(r.marketId) ?? [];
    arr.push(r.capturedAt);
    byMarket.set(r.marketId, arr);
  }
  return [...byMarket.entries()].map(([marketId, capturedAts]) => ({
    marketId,
    capturedAts: [...capturedAts].sort((a, b) => a.localeCompare(b)),
  }));
}
