/**
 * DEVICE OBSERVATION — the schema and the pure rules (v1.1.4 · Since Your Last Visit). No React, no storage,
 * no clock of its own.
 *
 * WHAT THIS OWNS: what THIS DEVICE previously observed about the games it follows and the forecasts it saved —
 * nothing more. It answers "what did this device last know?", never "what is true now?". Current truth is always
 * read from the canonical owners (schedules, the Live batch slate, the settlement ledgers, the Saved owner).
 *
 *   key        gtp.observation.v1      versioned; a newer schema is read as UNSUPPORTED and never written over
 *   identity   `<SPORT>:<eventId>`     MLB StatsAPI gamePk · NFL ESPN provider event id — the owners' own ids
 *   saved      the Saved owner's id    (`mlb-<gamePk>`, `nfl-<providerEventId>`, …) — never a substitute id
 *
 * A GAME FACT IS A STAGE, NOT A SCORE. The furthest point this device has seen a game reach:
 *
 *   PRE       scheduled start still in the future (schedule, on the reader's clock) or provider PRE
 *   LIVE      provider LIVE or DELAYED
 *   FINAL     provider FINAL, no canonical settlement yet
 *   SETTLED   the canonical settlement owner has a result
 *
 * Stages only move forward when facts merge. That single rule is what makes two tabs safe (an older tab cannot
 * regress a newer fact) and what makes an owner failure safe (missing evidence adds nothing, so it removes
 * nothing). A POSTPONED or CANCELLED game produces no fact at all.
 *
 * ⚠ `observedAt` / `committedAt` are DEVICE time: when this device saw a stage. They are never shown as — and
 * never used as — when a game started, ended, or was graded.
 *
 * BOUNDED. Facts exist only for games of CURRENTLY followed teams and for CURRENTLY saved forecasts; games whose
 * start is more than GAME_RETENTION_DAYS old are dropped (no owner can still prove a change for them); the game
 * map is capped. No score history, no page views, no provider or model payloads.
 */

export const OBSERVATION_STORAGE_KEY = "gtp.observation.v1";
export const OBSERVATION_SCHEMA_VERSION = 1;
/** Mirrors FOLLOW_STRUCTURAL_MAX (500) and SAVED_MAX (60): the id lists can never outgrow their owners. */
export const OBSERVATION_MAX_IDS = 500;
export const OBSERVATION_MAX_SAVED = 60;
export const OBSERVATION_MAX_GAMES = 300;
export const GAME_RETENTION_DAYS = 10;

export const STAGES = Object.freeze(["PRE", "LIVE", "FINAL", "SETTLED"]);
/** @param {string} s @returns {number} */
export const stageRank = (s) => STAGES.indexOf(s);

const SPORTS = new Set(["MLB", "NFL"]);
const EVENT_ID = /^\d{1,12}$/;
const TEAM_ID = { MLB: /^mlb-team-\d+$/, NFL: /^nfl-team-\d+$/ };
const ENTITY_ID = /^(mlb-team|nfl-team|nfl-athlete)-\d+$/;
const SAVED_ID = /^(mlb|nfl|epl|ufc)-\S{1,200}$/;

const isIso = (v) => typeof v === "string" && Number.isFinite(Date.parse(v));
const uniqSorted = (arr, re, max) => [...new Set((Array.isArray(arr) ? arr : []).filter((x) => typeof x === "string" && re.test(x)))].sort().slice(0, max);

/** @returns {{ schemaVersion: 1, committedAt: string|null, followedIds: string[], savedIds: string[], games: Record<string, any>, saved: Record<string, any> }} */
export function emptyObservation() {
  return { schemaVersion: OBSERVATION_SCHEMA_VERSION, committedAt: null, followedIds: [], savedIds: [], games: {}, saved: {} };
}

/** @param {string} sport @param {string} eventId */
export const gameKey = (sport, eventId) => `${sport}:${eventId}`;

/** A game fact as stored, or null when any part of it is not trustworthy. */
export function normalizeGameFact(x) {
  if (!x || typeof x !== "object") return null;
  if (!SPORTS.has(x.sport) || typeof x.eventId !== "string" || !EVENT_ID.test(x.eventId)) return null;
  if (stageRank(x.stage) < 0 || !isIso(x.observedAt)) return null;
  const teamIds = uniqSorted(x.teamIds, TEAM_ID[x.sport], 2);
  if (teamIds.length === 0) return null; // a fact nobody can be eligible for proves nothing
  return { sport: x.sport, eventId: x.eventId, teamIds, stage: x.stage, startUtc: isIso(x.startUtc) ? x.startUtc : null, observedAt: x.observedAt };
}

function normalizeSavedFact(x) {
  if (!x || typeof x !== "object" || typeof x.settled !== "boolean" || !isIso(x.observedAt)) return null;
  return { settled: x.settled, observedAt: x.observedAt };
}

/** Clean a schemaVersion-1 object into a document. Invalid pieces are dropped, never guessed. */
function normalizeDocument(d) {
  const doc = emptyObservation();
  doc.committedAt = isIso(d.committedAt) ? d.committedAt : null;
  doc.followedIds = uniqSorted(d.followedIds, ENTITY_ID, OBSERVATION_MAX_IDS);
  doc.savedIds = uniqSorted(d.savedIds, SAVED_ID, OBSERVATION_MAX_SAVED);
  if (d.games && typeof d.games === "object" && !Array.isArray(d.games)) {
    for (const [k, v] of Object.entries(d.games)) {
      const f = normalizeGameFact(v);
      if (f && k === gameKey(f.sport, f.eventId)) doc.games[k] = f; // a key that disagrees with its fact is dropped
    }
  }
  if (d.saved && typeof d.saved === "object" && !Array.isArray(d.saved)) {
    for (const [k, v] of Object.entries(d.saved)) {
      const f = normalizeSavedFact(v);
      if (f && SAVED_ID.test(k)) doc.saved[k] = f;
    }
  }
  return doc;
}

/**
 * Parse storage contents.
 *   EMPTY                nothing stored — a first visit
 *   OK                   a usable v1 document
 *   CORRUPT              unreadable or not a v1 document — recovered to empty (as gtp.follow.v2 does); writable
 *   UNSUPPORTED_VERSION  a NEWER schema — returned empty for display, and must never be written over
 *
 * @param {string|null|undefined} raw
 * @returns {{ status: "EMPTY"|"OK"|"CORRUPT"|"UNSUPPORTED_VERSION", doc: ReturnType<typeof emptyObservation>, foundVersion?: number }}
 */
export function parseObservation(raw) {
  if (raw === null || raw === undefined || raw === "") return { status: "EMPTY", doc: emptyObservation() };
  let d;
  try { d = JSON.parse(raw); } catch { return { status: "CORRUPT", doc: emptyObservation() }; }
  if (!d || typeof d !== "object" || Array.isArray(d)) return { status: "CORRUPT", doc: emptyObservation() };
  const v = d.schemaVersion;
  if (Number.isInteger(v) && v > OBSERVATION_SCHEMA_VERSION) return { status: "UNSUPPORTED_VERSION", doc: emptyObservation(), foundVersion: v };
  if (v !== OBSERVATION_SCHEMA_VERSION) return { status: "CORRUPT", doc: emptyObservation() };
  return { status: "OK", doc: normalizeDocument(d) };
}

/** Stable serialization: identical facts always produce identical bytes (keys sorted at every level). */
export function serializeObservation(doc) {
  const n = normalizeDocument(doc ?? {});
  const games = {};
  for (const k of Object.keys(n.games).sort()) {
    const f = n.games[k];
    games[k] = { sport: f.sport, eventId: f.eventId, teamIds: f.teamIds, stage: f.stage, startUtc: f.startUtc, observedAt: f.observedAt };
  }
  const saved = {};
  for (const k of Object.keys(n.saved).sort()) saved[k] = { settled: n.saved[k].settled, observedAt: n.saved[k].observedAt };
  return JSON.stringify({ schemaVersion: OBSERVATION_SCHEMA_VERSION, committedAt: n.committedAt, followedIds: n.followedIds, savedIds: n.savedIds, games, saved });
}

/** Do two documents hold the same FACTS? Device timestamps are ignored — they are not facts about sport. */
export function sameFacts(a, b) {
  const strip = (doc) => {
    const n = normalizeDocument(doc ?? {});
    return JSON.stringify([
      n.followedIds, n.savedIds,
      Object.keys(n.games).sort().map((k) => [k, n.games[k].stage, n.games[k].teamIds, n.games[k].startUtc]),
      Object.keys(n.saved).sort().map((k) => [k, n.saved[k].settled]),
    ]);
  };
  return strip(a) === strip(b);
}

/**
 * Merge freshly observed facts into a persisted document.
 *
 * `fresh` carries only slices whose owners are READY. A slice that is null (owner loading, failed, or broken)
 * leaves the persisted slice exactly as it was — owner failure is unknown, never "nothing changed".
 *
 *   followedIds / savedIds   replaced by the current set when that owner is ready (the follow/saved owners are
 *                            shared device storage, so the current set is the newest truth about intent)
 *   game stage               max(persisted, fresh) — never regresses; observedAt moves only when the stage does
 *   saved settled            persisted || fresh — a graded forecast never becomes ungraded
 *   committedAt              max(persisted, now)
 *
 * @param {any} persisted
 * @param {{ followedIds?: string[]|null, savedIds?: string[]|null, games?: any[]|null, saved?: Array<{ id: string, settled: boolean }>|null }} fresh
 * @param {{ nowIso: string }} options
 */
export function mergeObservation(persisted, fresh, { nowIso }) {
  const base = normalizeDocument(persisted ?? {});
  const out = { ...base, games: { ...base.games }, saved: { ...base.saved } };
  if (Array.isArray(fresh?.followedIds)) out.followedIds = uniqSorted(fresh.followedIds, ENTITY_ID, OBSERVATION_MAX_IDS);
  if (Array.isArray(fresh?.savedIds)) out.savedIds = uniqSorted(fresh.savedIds, SAVED_ID, OBSERVATION_MAX_SAVED);

  for (const g of Array.isArray(fresh?.games) ? fresh.games : []) {
    const f = normalizeGameFact({ ...g, observedAt: nowIso });
    if (!f) continue;
    const k = gameKey(f.sport, f.eventId);
    const prev = out.games[k];
    if (!prev) { out.games[k] = f; continue; }
    const advanced = stageRank(f.stage) > stageRank(prev.stage);
    out.games[k] = {
      ...prev,
      stage: advanced ? f.stage : prev.stage,
      observedAt: advanced ? nowIso : prev.observedAt,
      teamIds: uniqSorted([...prev.teamIds, ...f.teamIds], TEAM_ID[f.sport], 2),
      startUtc: f.startUtc ?? prev.startUtc,
    };
  }

  for (const s of Array.isArray(fresh?.saved) ? fresh.saved : []) {
    if (!s || typeof s.id !== "string" || !SAVED_ID.test(s.id) || typeof s.settled !== "boolean") continue;
    const prev = out.saved[s.id];
    if (!prev) { out.saved[s.id] = { settled: s.settled, observedAt: nowIso }; continue; }
    if (s.settled && !prev.settled) out.saved[s.id] = { settled: true, observedAt: nowIso };
  }

  out.committedAt = base.committedAt && Date.parse(base.committedAt) > Date.parse(nowIso) ? base.committedAt : nowIso;
  return pruneObservation(out, { nowIso });
}

/**
 * Keep only facts that can still prove a future change.
 *   - a game survives only while one of its teams is followed (an unfollow ends that era: a later re-follow
 *     starts from a new baseline instead of resurrecting old facts)
 *   - a saved fact survives only while the forecast is saved
 *   - a game whose known start is older than GAME_RETENTION_DAYS is dropped
 *   - the game map is capped, keeping the most recent starts
 */
export function pruneObservation(doc, { nowIso }) {
  const n = normalizeDocument(doc ?? {});
  const followed = new Set(n.followedIds);
  const saved = new Set(n.savedIds);
  const floor = Date.parse(nowIso) - GAME_RETENTION_DAYS * 86_400_000;
  const kept = Object.entries(n.games).filter(([, f]) => {
    if (!f.teamIds.some((id) => followed.has(id))) return false;
    if (f.startUtc && Date.parse(f.startUtc) < floor) return false;
    return true;
  });
  kept.sort(([ka, a], [kb, b]) => {
    const ta = a.startUtc ? Date.parse(a.startUtc) : -Infinity;
    const tb = b.startUtc ? Date.parse(b.startUtc) : -Infinity;
    return tb - ta || ka.localeCompare(kb);
  });
  n.games = Object.fromEntries(kept.slice(0, OBSERVATION_MAX_GAMES));
  n.saved = Object.fromEntries(Object.entries(n.saved).filter(([id]) => saved.has(id)));
  return n;
}
