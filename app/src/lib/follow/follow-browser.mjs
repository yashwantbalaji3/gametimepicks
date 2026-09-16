/**
 * FOLLOWING — browser persistence adapter (v1.1.2). Node-free; the Storage is INJECTED.
 *
 * Every storage interaction the hook performs lives here, taking a `Storage`-shaped object as an
 * argument, so the ugly cases — private mode, a quota exception, a getItem that throws, a tab that
 * wrote a future schema — are testable with a fake instead of hoped-for in a browser.
 *
 * NOTHING HERE RUNS AT IMPORT. No module-level `window` or `localStorage` access, so a server/build
 * import of this file is inert (§12).
 */
import {
  FOLLOW_LEGACY_KEY, FOLLOW_STORAGE_KEY, clearAll, emptyDocument, follow as followOp, migrateLegacyNames,
  parseDocument, serializeDocument, unfollow as unfollowOp,
} from "./follow-schema.mjs";

/**
 * Read the current document.
 *
 * Returns `{ doc, status, unresolvedLegacy }` where status is one of:
 *   OK | EMPTY | CORRUPT        usable; CORRUPT was recovered to empty
 *   UNSUPPORTED_VERSION         newer code wrote this — usable as EMPTY for display, but NOT writable
 *   UNAVAILABLE                 storage itself threw (private mode, blocked, sandboxed)
 *
 * MIGRATION. If no v2 document exists but P251's name array does, and a `legacyMap` is supplied, the
 * resolvable names are migrated into a fresh v2 document which is WRITTEN, and the v1 key is left
 * exactly as it was. Without a map nothing is guessed: the legacy names are counted, not converted.
 */
/**
 * @param {{ getItem: (k: string) => string|null, setItem: (k: string, v: string) => void }} storage
 * @param {{ legacyMap?: Record<string, any>|null, nowIso?: string|null }} [options]
 * @returns {{ doc: any, status: string, unresolvedLegacy: number, foundVersion?: number, migrated?: number }}
 */
export function readFollowing(storage, { legacyMap = null, nowIso = null } = {}) {
  let raw;
  try {
    raw = storage.getItem(FOLLOW_STORAGE_KEY);
  } catch {
    return { doc: emptyDocument(), status: "UNAVAILABLE", unresolvedLegacy: 0 };
  }

  const parsed = parseDocument(raw);
  if (parsed.status !== "EMPTY") {
    return { doc: parsed.doc, status: parsed.status, unresolvedLegacy: 0, foundVersion: parsed.foundVersion };
  }

  // No v2 document. Is there a P251 array to bring forward?
  let legacyRaw = null;
  try {
    legacyRaw = storage.getItem(FOLLOW_LEGACY_KEY);
  } catch {
    return { doc: emptyDocument(), status: "UNAVAILABLE", unresolvedLegacy: 0 };
  }
  if (!legacyRaw) return { doc: emptyDocument(), status: "EMPTY", unresolvedLegacy: 0 };

  if (!legacyMap) {
    let count = 0;
    try {
      const arr = JSON.parse(legacyRaw);
      count = Array.isArray(arr) ? arr.filter((x) => typeof x === "string" && x.trim()).length : 0;
    } catch {
      count = 0;
    }
    return { doc: emptyDocument(), status: "EMPTY", unresolvedLegacy: count };
  }

  const { migrated, unresolved } = migrateLegacyNames(legacyRaw, legacyMap);
  const doc = { ...emptyDocument(), followed: migrated, updatedAt: migrated.length ? nowIso : null };
  if (migrated.length) {
    try {
      storage.setItem(FOLLOW_STORAGE_KEY, serializeDocument(doc));
      // ⚠ FOLLOW_LEGACY_KEY is deliberately NOT removed. A rollback to P251 code reads it intact.
    } catch {
      return { doc, status: "UNAVAILABLE", unresolvedLegacy: unresolved.length };
    }
  }
  return { doc, status: migrated.length ? "OK" : "EMPTY", unresolvedLegacy: unresolved.length, migrated: migrated.length };
}

/**
 * Apply one operation and persist it.
 *
 * ⚠ Re-reads storage FIRST rather than trusting a React state snapshot, so a follow made in another
 * tab a moment ago is not overwritten by a stale in-memory copy.
 *
 * ⚠ REFUSES TO WRITE over a future-version document: a reader on an older deploy must not destroy what
 * a newer one saved. The refusal is reported, and the UI shows the control as unavailable.
 */
/**
 * @param {{ getItem: (k: string) => string|null, setItem: (k: string, v: string) => void }} storage
 * @param {"follow"|"unfollow"|"clear"} op
 * @param {{ ref?: any, nowIso?: string|null, legacyMap?: Record<string, any>|null }} [options]
 * @returns {{ doc: any, status: string, changed: boolean, reason: string, unresolvedLegacy?: number }}
 */
export function applyFollowing(storage, op, { ref = null, nowIso = null, legacyMap = null } = {}) {
  const current = readFollowing(storage, { legacyMap, nowIso });
  if (current.status === "UNAVAILABLE") return { ...current, changed: false, reason: "STORAGE_UNAVAILABLE" };
  if (current.status === "UNSUPPORTED_VERSION") return { ...current, changed: false, reason: "UNSUPPORTED_VERSION" };

  let result;
  if (op === "follow") result = followOp(current.doc, ref, nowIso);
  else if (op === "unfollow") result = unfollowOp(current.doc, ref, nowIso);
  else if (op === "clear") result = { doc: clearAll(nowIso), changed: current.doc.followed.length > 0, reason: "CLEARED" };
  else return { ...current, changed: false, reason: "UNKNOWN_OP" };

  if (!result.changed && op !== "follow") return { doc: current.doc, status: current.status, changed: false, reason: result.reason };
  // A follow that was already present may still carry a fresher label hint worth persisting.
  try {
    storage.setItem(FOLLOW_STORAGE_KEY, serializeDocument(result.doc));
  } catch {
    // Quota or blocked storage. The in-memory state is NOT advanced, so the UI never claims a follow
    // that did not persist — it would vanish on refresh, which is worse than an honest failure.
    return { doc: current.doc, status: "UNAVAILABLE", changed: false, reason: "WRITE_FAILED" };
  }
  return { doc: result.doc, status: "OK", changed: result.changed, reason: result.reason };
}

/**
 * Should a `storage` event from another tab trigger a re-read?
 *
 * The event's `newValue` is NEVER trusted as data — another tab, an extension, or a devtools edit can
 * put anything there. The event is only a hint that the key changed; the store is re-read and re-parsed
 * through the same contract as any other read.
 */
/** @param {any} event @returns {boolean} */
export function isFollowingStorageEvent(event) {
  if (!event || typeof event !== "object") return false;
  // `key === null` means storage.clear() in another tab — that affects us too.
  return event.key === FOLLOW_STORAGE_KEY || event.key === FOLLOW_LEGACY_KEY || event.key === null;
}
