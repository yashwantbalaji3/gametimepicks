/**
 * Append-only event-level board coverage (Program 096-099 Lane B).
 *
 * The whole-slate top-up is safe but blunt: once ANY game starts, no later evening game can gain
 * coverage, because the only tool was full-board regeneration. This module makes coverage
 * addition append-only instead:
 *
 *     immutable base board  +  append-only event patch stream  →  deterministic materialized view
 *
 * PROPERTIES (each mutation-tested in board-patches.test.mjs):
 *   - Base board rows NEVER change after publication; a patch can only ADD rows.
 *   - A patch targets exactly one event whose scheduled start is still in the future at
 *     validation time; started-event patches are refused.
 *   - Row identity is immutable and collision-resistant; a patch that would overwrite an
 *     existing identity (base or prior patch) is REFUSED — never last-write-wins.
 *   - Patch application is deterministic (ordered by sequence, then patchId) and idempotent
 *     (re-applying an accepted patch is a no-op, not a duplicate).
 *   - Official-addition rows (first eligible capture of a previously uncovered question) are
 *     separated from movement-only snapshots (later captures of an already covered question):
 *     movement snapshots NEVER enter the official generated population or W/L denominators.
 *   - Cached provider data cannot be restamped: a patch's capturedAt must be >= the patch's
 *     requestFingerprint capture window start and < the event's scheduledStart.
 *
 * FORWARD-ONLY: no board before ROLLOUT_START may carry patches; historical boards are never
 * rewritten into this architecture.
 */

export const PATCH_SCHEMA_VERSION = 1;
export const ROLLOUT_START = "2026-08-01"; // first slate allowed to carry patches (forward-only)

export const PATCH_KINDS = Object.freeze({
  OFFICIAL_ADDITION: "official_addition", // enters the closed generated population; settles normally
  MOVEMENT_SNAPSHOT: "movement_snapshot", // research-only; excluded from official accounting
});

/**
 * Immutable row identity — repository-native IDs only (no display names).
 * eventId + marketFamily + participantId + line + side + capturePolicyVersion.
 * Doubleheaders stay distinct because eventId (provider event) and gamePk are 1:1 post-Sprint-041.
 */
export function rowIdentity(row) {
  // PREFER the pipeline's own canonical row key. Board rows carry
  // `id = "<gameId>-<Player_Name>-<market>-<line>"`, which is collision-resistant by
  // construction and already doubleheader-safe (gameId ↔ gamePk is 1:1 post-Sprint-041).
  //
  // WHY THIS TAKES PRECEDENCE (found on the real 2026-08-03 board before wiring patches live):
  // production rows frequently carry `playerId: null` AND `player: null` — the participant lives
  // only inside `id`. The composite fallback below then degraded to the literal "team" for every
  // such row, so THREE groups of genuinely different players (Jose Tena vs Nasim Nunez; Herrera
  // vs Caballero vs Fermin; Pena vs Gimenez vs Sanchez) collapsed onto one identity — 211 rows
  // producing only 206 identities. Under the patch contract that is not cosmetic: an official
  // addition for a different player at the same market/line/side would have been refused as a
  // duplicate, silently dropping a legitimate prediction.
  if (typeof row?.id === "string" && row.id.length > 0) return row.id;

  const participant = row.playerId ?? row.participantId ?? row.player ?? "team";
  const parts = [
    row.gameId ?? row.eventId ?? "",
    row.marketKey ?? "",
    participant,
    row.line ?? row.threshold ?? "",
    row.side ?? row.lean ?? "",
    row.capturePolicyVersion ?? 1,
  ];
  if (parts[0] === "" || parts[1] === "") return null; // identity requires event + market
  return parts.join("|");
}

/** All row identities present on a base board (its leans are the published population). */
export function baseIdentities(board) {
  const ids = new Set();
  for (const l of board?.leans ?? []) {
    const id = rowIdentity(l);
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Validate one patch against the base board and previously accepted patches.
 * @returns {{ok:true}|{ok:false, refusal:string}}
 */
export function validatePatch(patch, board, acceptedPatches, nowIso) {
  const r = (refusal) => ({ ok: false, refusal });
  if (patch?.schemaVersion !== PATCH_SCHEMA_VERSION) return r("wrong patch schemaVersion");
  if (!patch.patchId || typeof patch.seq !== "number") return r("missing patchId/seq");
  if (patch.kind !== PATCH_KINDS.OFFICIAL_ADDITION && patch.kind !== PATCH_KINDS.MOVEMENT_SNAPSHOT)
    return r("unknown patch kind");
  if (!patch.eventId || !patch.gamePk) return r("patch must target one event (eventId + gamePk)");
  if (!patch.requestFingerprint) return r("missing provider requestFingerprint");
  if ((board?.date ?? "") < ROLLOUT_START) return r(`forward-only: boards before ${ROLLOUT_START} are immutable history`);

  // The targeted event must exist on the base board's SCHEDULE (canonical upstream)…
  const game = (board?.games ?? []).find((g) => g?.gamePk === patch.gamePk);
  if (!game) return r("target event is not on the base board schedule (no upstream identity)");

  // …and must not have started: started-event patches are impossible.
  const start = Date.parse(patch.scheduledStart ?? game.gameDate ?? "");
  if (!Number.isFinite(start)) return r("unknown scheduledStart — never patch what cannot be time-checked");
  if (Date.parse(nowIso) >= start) return r("event already started — append window closed");

  // Provenance: every row must be a genuine pregame capture, never a restamped cache.
  for (const row of patch.rows ?? []) {
    const cap = Date.parse(row.capturedAt ?? "");
    if (!Number.isFinite(cap)) return r("row without capturedAt");
    if (cap >= start) return r("row captured at/after scheduled start — not pregame");
    if (Date.parse(patch.capturedAt ?? row.capturedAt) < Date.parse(patch.requestWindowStart ?? patch.capturedAt ?? row.capturedAt))
      return r("capturedAt precedes its own request window — cached data cannot be restamped");
    if ((row.gameId ?? row.eventId) !== patch.eventId) return r("row eventId differs from patch target");
  }
  if (!Array.isArray(patch.rows) || patch.rows.length === 0) return r("empty patch");

  // Identity: no overwrite of base or previously accepted identities (official additions only —
  // movement snapshots may re-capture an existing question because they never join the population).
  if (patch.kind === PATCH_KINDS.OFFICIAL_ADDITION) {
    const existing = baseIdentities(board);
    for (const p of acceptedPatches ?? []) {
      if (p.kind !== PATCH_KINDS.OFFICIAL_ADDITION) continue;
      for (const row of p.rows) { const id = rowIdentity(row); if (id) existing.add(id); }
    }
    for (const row of patch.rows) {
      const id = rowIdentity(row);
      if (!id) return r("row lacks a canonical identity");
      if (existing.has(id)) return r(`identity already published (${id}) — overwrite refused, never last-write-wins`);
    }
  }
  return { ok: true };
}

/**
 * Deterministic, idempotent materialization: base + accepted OFFICIAL_ADDITION patches.
 * Movement snapshots are surfaced separately and never join the population.
 */
export function materialize(board, patches, nowIso) {
  const accepted = [];
  const refused = [];
  const seen = new Set();
  const ordered = [...(patches ?? [])].sort((a, b) => (a.seq - b.seq) || String(a.patchId).localeCompare(String(b.patchId)));
  for (const patch of ordered) {
    if (seen.has(patch.patchId)) { refused.push({ patchId: patch.patchId, refusal: "duplicate patchId (idempotent no-op)" }); continue; }
    const v = validatePatch(patch, board, accepted, nowIso ?? patch.acceptedAt ?? new Date(0).toISOString());
    if (v.ok) { accepted.push(patch); seen.add(patch.patchId); }
    else refused.push({ patchId: patch.patchId, refusal: v.refusal });
  }
  const officialRows = accepted
    .filter((p) => p.kind === PATCH_KINDS.OFFICIAL_ADDITION)
    .flatMap((p) => p.rows.map((row) => ({ ...row, patchId: p.patchId, appendedAt: p.capturedAt ?? row.capturedAt })));
  return {
    view: {
      ...board,
      leans: [...(board?.leans ?? []), ...officialRows],
      patchProvenance: accepted.map((p) => ({ patchId: p.patchId, kind: p.kind, eventId: p.eventId, gamePk: p.gamePk, capturedAt: p.capturedAt ?? null, rows: p.rows.length })),
    },
    accepted,
    refused,
    movementSnapshots: accepted.filter((p) => p.kind === PATCH_KINDS.MOVEMENT_SNAPSHOT),
    accounting: {
      baseRows: (board?.leans ?? []).length,
      appendedOfficialRows: officialRows.length,
      publishedPopulation: (board?.leans ?? []).length + officialRows.length,
      movementSnapshotRows: accepted.filter((p) => p.kind === PATCH_KINDS.MOVEMENT_SNAPSHOT).reduce((n, p) => n + p.rows.length, 0),
    },
  };
}

/** Settlement reads exactly the published union: base + accepted official additions, nothing else. */
export function settlementPopulation(board, patches, nowIso) {
  const m = materialize(board, patches, nowIso);
  return { rows: m.view.leans, accounting: m.accounting };
}
