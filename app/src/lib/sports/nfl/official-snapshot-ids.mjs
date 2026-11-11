/**
 * The official forecast of record's snapshot id per event (CANON-01 nflOfficialOfRecord — the one selector, nothing
 * rebuilt), for board provenance. Imports a .ts module through official-of-record.mjs: run under tsx.
 */
import { nflOfficialOfRecord } from "./official-of-record.mjs";

/** @returns {Record<string, { snapshotId: string|null, basis: string|null, forecastGeneratedAt: string|null, refusal: string|null }>} */
export function officialSnapshotIds(publicDir, eventIds) {
  const out = {};
  for (const id of [...new Set(eventIds.map(String))].sort()) {
    const r = nflOfficialOfRecord(publicDir, id);
    out[id] = r
      ? { snapshotId: r.snapshot?.snapshotId ?? null, basis: r.basis, forecastGeneratedAt: r.forecast?.generatedAt ?? null, refusal: r.snapshot?.snapshotId ? null : (r.refusal ?? "NO_SNAPSHOT") }
      : { snapshotId: null, basis: null, forecastGeneratedAt: null, refusal: "NO_OFFICIAL_RECORD" };
  }
  return out;
}
