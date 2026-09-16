/**
 * FOLLOWING — the pure contract (v1.1.2). No React, no window, no network, no clock of its own.
 *
 * Same split as Saved Forecasts (`saved-schema.mjs` pure + `saved-store.ts` hook): every rule lives
 * here, where a test can reach it, and the browser hook only reads, writes and syncs.
 *
 * WHAT CHANGED FROM P251 · F9, AND WHY. The first follow store keyed a follow on the club's DISPLAY
 * NAME ("Seattle Seahawks") in an unversioned array, capped at 12. That was a reasonable choice when
 * the only thing anyone could follow was an NFL team from one board. It cannot carry what comes next:
 * a name has no sport (MLB and NFL both have "Giants"), cannot hold a player, breaks the day a club
 * renames, and gives My GameTime nothing stable to join on. v1.1.2 keys on the canonical id that the
 * published artifacts already carry.
 *
 * ⚠ NOT A NEW ID SPACE. `mlb-team-147` is StatsAPI team 147; `nfl-team-2` is ESPN team 2;
 * `nfl-athlete-4429795` is ESPN athlete 4429795 — the lineage Live already established. The prefix
 * namespaces an EXISTING provider id so the three are distinguishable at a glance; nothing is minted.
 *
 * ⚠ LEGACY DATA IS PRESERVED, NEVER DESTROYED. Readers who followed a club before v1.1.2 have names
 * under `gtp.follow.v1`. They are migrated FORWARD into `gtp.follow.v2` where a name resolves to exactly
 * one canonical id, and the v1 key is left untouched — so a rollback to older code still finds its
 * own data intact, and a name we could not resolve is kept rather than silently lost.
 */

/** The document key. `v2` because the unversioned array under `v1` was generation 1. */
export const FOLLOW_STORAGE_KEY = "gtp.follow.v2";
/** The P251 · F9 key. READ for migration only — this module never writes it. */
export const FOLLOW_LEGACY_KEY = "gtp.follow.v1";
export const FOLLOW_SCHEMA_VERSION = 2;
/** Same-tab change channel (the `storage` event only fires in OTHER tabs). */
export const FOLLOW_CHANNEL = "gtp:follow";

/**
 * A STRUCTURAL ceiling, not a product limit.
 *
 * P251 capped follows at 12 ("a shortlist, not a subscription list"). That cap silently dropped the
 * thirteenth follow and was doing the job of validation. There is no evidence a reader following 20
 * teams is a problem. This bound exists only so a corrupted or adversarial document cannot grow
 * without limit in localStorage; no reader following by hand will ever meet it.
 */
export const FOLLOW_STRUCTURAL_MAX = 500;

/** Every (sport, entityType) pair this release supports. Anything else is refused at the boundary. */
export const SUPPORTED_FOLLOW_KINDS = Object.freeze([
  Object.freeze({ sport: "MLB", entityType: "team" }),
  Object.freeze({ sport: "NFL", entityType: "team" }),
  Object.freeze({ sport: "NFL", entityType: "player" }),
  // ⚠ No MLB player: MLB publishes no canonical public player id — its only per-player artifact is a
  // bookmaker price list keyed by NAME. A follow keyed on that would be the display-name identity
  // this contract exists to retire.
]);

/** The id shape each supported kind must match. An id that does not match is not that entity. */
const ID_PATTERN = Object.freeze({
  "MLB:team": /^mlb-team-\d{1,6}$/,
  "NFL:team": /^nfl-team-\d{1,6}$/,
  "NFL:player": /^nfl-athlete-\d{1,12}$/,
});

const MAX_LABEL = 80;

/** Canonicalize casing at the boundary so "nfl"/"Team" cannot create a second follow. */
function canonicalSport(x) {
  return typeof x === "string" ? x.trim().toUpperCase() : null;
}
function canonicalType(x) {
  return typeof x === "string" ? x.trim().toLowerCase() : null;
}

/**
 * Validate and normalize ONE ref. Returns the canonical ref or null.
 *
 * `label` survives only as a display HINT — it is never part of identity, never used to dedupe, and
 * a missing label is fine because the UI resolves names from current public data.
 */
/** @param {any} input @returns {{ sport: "MLB"|"NFL", entityType: "team"|"player", id: string, label?: string } | null} */
export function normalizeRef(input) {
  if (!input || typeof input !== "object") return null;
  const sport = canonicalSport(input.sport);
  const entityType = canonicalType(input.entityType);
  const id = typeof input.id === "string" ? input.id.trim().toLowerCase() : "";
  if (!sport || !entityType || !id) return null;
  const pattern = ID_PATTERN[`${sport}:${entityType}`];
  if (!pattern || !pattern.test(id)) return null;
  const ref = { sport, entityType, id };
  if (typeof input.label === "string") {
    const label = input.label.trim().slice(0, MAX_LABEL);
    if (label) ref.label = label;
  }
  return ref;
}

/** The identity of a ref. Two refs are the same follow iff this string matches. */
export function refKey(ref) {
  return `${ref.sport}:${ref.entityType}:${ref.id}`;
}

/** Canonical order: deterministic, independent of the order anything was clicked. */
function compareRefs(a, b) {
  return refKey(a) < refKey(b) ? -1 : refKey(a) > refKey(b) ? 1 : 0;
}

/**
 * Dedupe + sort + bound. When two copies of one follow disagree on the label hint, the later one in
 * input order wins — a fresher name is a better hint, and identity is unaffected either way.
 */
export function canonicalizeRefs(refs) {
  const byKey = new Map();
  for (const raw of Array.isArray(refs) ? refs : []) {
    const ref = normalizeRef(raw);
    if (ref) byKey.set(refKey(ref), ref);
  }
  return [...byKey.values()].sort(compareRefs).slice(0, FOLLOW_STRUCTURAL_MAX);
}

/** An empty, current-version document. `updatedAt` is null until the reader actually changes something. */
export function emptyDocument() {
  return { schemaVersion: FOLLOW_SCHEMA_VERSION, followed: [], updatedAt: null };
}

/**
 * Parse whatever is stored under the v2 key.
 *
 * Returns `{ status, doc }`:
 *   OK                   a valid current-version document (possibly sanitized)
 *   EMPTY                nothing stored
 *   CORRUPT              unreadable JSON or the wrong shape — recovered to empty, safely
 *   UNSUPPORTED_VERSION  written by NEWER code. Read as unsupported and NEVER rewritten, so a reader
 *                        who briefly lands on an older deploy does not lose what the newer one saved.
 */
export function parseDocument(raw) {
  if (raw === null || raw === undefined || raw === "") return { status: "EMPTY", doc: emptyDocument() };
  let parsed;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return { status: "CORRUPT", doc: emptyDocument() };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { status: "CORRUPT", doc: emptyDocument() };
  }
  const version = parsed.schemaVersion;
  if (typeof version === "number" && Number.isInteger(version) && version > FOLLOW_SCHEMA_VERSION) {
    // ⚠ Returned so the caller can refuse to write. The contents are deliberately NOT interpreted.
    return { status: "UNSUPPORTED_VERSION", doc: emptyDocument(), foundVersion: version };
  }
  if (version !== FOLLOW_SCHEMA_VERSION) return { status: "CORRUPT", doc: emptyDocument() };
  return {
    status: "OK",
    doc: {
      schemaVersion: FOLLOW_SCHEMA_VERSION,
      followed: canonicalizeRefs(parsed.followed),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    },
  };
}

/** Stable serialization: canonical order, no volatile fields beyond the one timestamp. */
export function serializeDocument(doc) {
  return JSON.stringify({
    schemaVersion: FOLLOW_SCHEMA_VERSION,
    followed: canonicalizeRefs(doc?.followed).map(({ sport, entityType, id, label }) =>
      label ? { sport, entityType, id, label } : { sport, entityType, id },
    ),
    updatedAt: typeof doc?.updatedAt === "string" ? doc.updatedAt : null,
  });
}

/**
 * Migrate the P251 · F9 name array forward.
 *
 * `nameToRef` maps a legacy display name to the canonical ref it denotes. The only writer of that key
 * was the NFL weekly board, which stored full club names, so in practice the map is the 32 NFL clubs —
 * but the function does not assume that: a name maps only if the map says so.
 *
 * Returns `{ migrated, unresolved }`. A name that resolves to nothing is REPORTED, not dropped, and the
 * legacy key itself is never modified here.
 */
export function migrateLegacyNames(legacyRaw, nameToRef) {
  let names = [];
  try {
    const parsed = typeof legacyRaw === "string" ? JSON.parse(legacyRaw) : legacyRaw;
    if (Array.isArray(parsed)) names = parsed.filter((x) => typeof x === "string" && x.trim());
  } catch {
    return { migrated: [], unresolved: [] };
  }
  const migrated = [];
  const unresolved = [];
  for (const name of names) {
    const ref = nameToRef && typeof nameToRef === "object" ? nameToRef[name.trim()] : undefined;
    const normalized = ref ? normalizeRef({ ...ref, label: ref.label ?? name.trim() }) : null;
    if (normalized) migrated.push(normalized);
    else unresolved.push(name.trim());
  }
  return { migrated: canonicalizeRefs(migrated), unresolved };
}

/* ─────────────────────────── operations ─────────────────────────── */

export function isFollowing(doc, ref) {
  const r = normalizeRef(ref);
  if (!r) return false;
  const k = refKey(r);
  return (doc?.followed ?? []).some((f) => refKey(f) === k);
}

/** Follow. Idempotent. An invalid ref returns the document unchanged rather than throwing. */
export function follow(doc, ref, nowIso) {
  const r = normalizeRef(ref);
  if (!r) return { doc, changed: false, reason: "INVALID_REF" };
  if (isFollowing(doc, r)) {
    // Refresh a stale label hint without counting it as a change to the follow set.
    const followed = canonicalizeRefs([...(doc?.followed ?? []), r]);
    return { doc: { ...doc, followed }, changed: false, reason: "ALREADY_FOLLOWING" };
  }
  if ((doc?.followed?.length ?? 0) >= FOLLOW_STRUCTURAL_MAX) {
    return { doc, changed: false, reason: "STRUCTURAL_MAX" };
  }
  return {
    doc: { schemaVersion: FOLLOW_SCHEMA_VERSION, followed: canonicalizeRefs([...(doc?.followed ?? []), r]), updatedAt: nowIso ?? null },
    changed: true,
    reason: "FOLLOWED",
  };
}

/** Unfollow. Idempotent; unfollowing something not followed is a no-op, not an error. */
export function unfollow(doc, ref, nowIso) {
  const r = normalizeRef(ref);
  if (!r || !isFollowing(doc, r)) return { doc, changed: false, reason: r ? "NOT_FOLLOWING" : "INVALID_REF" };
  const k = refKey(r);
  return {
    doc: { schemaVersion: FOLLOW_SCHEMA_VERSION, followed: (doc.followed ?? []).filter((f) => refKey(f) !== k), updatedAt: nowIso ?? null },
    changed: true,
    reason: "UNFOLLOWED",
  };
}

/** Filter by sport and/or type. Returns canonical order. */
export function listFollowed(doc, { sport, entityType } = {}) {
  const s = sport ? canonicalSport(sport) : null;
  const t = entityType ? canonicalType(entityType) : null;
  return (doc?.followed ?? []).filter((f) => (!s || f.sport === s) && (!t || f.entityType === t));
}

export function clearAll(nowIso) {
  return { ...emptyDocument(), updatedAt: nowIso ?? null };
}

/* ─────────────────────── canonical id builders ─────────────────────── */

/** Build a canonical ref from a provider id. Returns null for anything that is not a real id. */
/** @param {string|number|null|undefined} statsApiTeamId @param {string} [label] @returns {{ sport: "MLB"|"NFL", entityType: "team"|"player", id: string, label?: string } | null} */
export function mlbTeamRef(statsApiTeamId, label) {
  return normalizeRef({ sport: "MLB", entityType: "team", id: `mlb-team-${String(statsApiTeamId ?? "").trim()}`, label });
}
/** @param {string|number|null|undefined} espnTeamId @param {string} [label] @returns {{ sport: "MLB"|"NFL", entityType: "team"|"player", id: string, label?: string } | null} */
export function nflTeamRef(espnTeamId, label) {
  return normalizeRef({ sport: "NFL", entityType: "team", id: `nfl-team-${String(espnTeamId ?? "").trim()}`, label });
}
/** @param {string|null|undefined} playerId @param {string} [label] @returns {{ sport: "MLB"|"NFL", entityType: "team"|"player", id: string, label?: string } | null} */
export function nflPlayerRef(playerId, label) {
  // Accepts the board's own `nfl-athlete-<id>` string verbatim — the lineage is reused, not rebuilt.
  return normalizeRef({ sport: "NFL", entityType: "player", id: String(playerId ?? "").trim(), label });
}
