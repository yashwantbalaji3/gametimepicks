/**
 * NFL TOP BOARDS · PROVENANCE (row G, PD 2026-11-11). PURE (crypto only): what a board was built from.
 *
 *   per event   the official forecast of record's snapshot id (CANON-01 nflOfficialOfRecord — resolved by the caller,
 *               official-snapshot-ids.mjs) and the sha256 of the per-game player-board bytes the ranking read
 *   chainHash   sha256 over the ordered [eventId, snapshotId, boardSha256] list — one id for "these boards, from these
 *               official snapshots"; any change to a constituent board or official snapshot changes it
 * `complete` is false when an event has no official snapshot (its refusal is recorded, never guessed).
 */
import crypto from "node:crypto";

export const BOARD_PROVENANCE_SCHEMA = "gtp.nfl.board-provenance@1";
export const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/**
 * @param {Array<{ eventId: string, official: { snapshotId: string|null, basis?: string|null, forecastGeneratedAt?: string|null, refusal?: string|null } | null, boardSha256: string|null, boardGeneratedAt?: string|null }>} events
 */
export function boardProvenance(events) {
  const rows = [...events].map((e) => ({
    eventId: String(e.eventId),
    officialSnapshotId: e.official?.snapshotId ?? null,
    officialBasis: e.official?.basis ?? null,
    forecastGeneratedAt: e.official?.forecastGeneratedAt ?? null,
    ...(e.official?.snapshotId ? {} : { refusal: e.official?.refusal ?? "NO_OFFICIAL_RECORD" }),
    boardSha256: e.boardSha256 ?? null,
    boardGeneratedAt: e.boardGeneratedAt ?? null,
  })).sort((a, b) => (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0));
  const chainHash = sha256(JSON.stringify(rows.map((r) => [r.eventId, r.officialSnapshotId, r.boardSha256])));
  return { schema: BOARD_PROVENANCE_SCHEMA, complete: rows.every((r) => r.officialSnapshotId && r.boardSha256), chainHash, events: rows };
}

/** A typed absence when the snapshot ids could not be resolved (the boards still publish; nothing is invented). */
export const provenanceUnavailable = (reason) => ({ schema: BOARD_PROVENANCE_SCHEMA, complete: false, chainHash: null, state: "UNAVAILABLE", reason });
