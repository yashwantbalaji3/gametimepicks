/**
 * DEVICE OBSERVATION — browser persistence adapter (v1.1.4). Node-free; the Storage is INJECTED.
 *
 * Every storage interaction the hook performs lives here, so private mode, a throwing getItem, a quota error, a
 * corrupt value and a newer schema are all testable with a fake (the follow-browser.mjs pattern). Nothing runs at
 * import.
 *
 * MULTI-TAB. A commit RE-READS storage immediately before writing and merges into what it finds, and merging never
 * moves a fact backwards — so a tab holding an older picture cannot overwrite a newer one. A storage event is only
 * a hint to re-read; its payload is never trusted.
 *
 * NO WRITE STORMS. A commit whose facts equal what is stored does not write (unless it is the session's first
 * commit, which records that this visit happened). A failed write reports failure — it never pretends the
 * baseline moved.
 */
import { OBSERVATION_STORAGE_KEY, mergeObservation, parseObservation, sameFacts, serializeObservation } from "./observation-schema.mjs";

/**
 * @param {{ getItem: (k: string) => string|null }} storage
 * @returns {{ status: string, doc: any, foundVersion?: number }}
 */
export function readObservation(storage) {
  let raw;
  try {
    raw = storage.getItem(OBSERVATION_STORAGE_KEY);
  } catch {
    return { status: "UNAVAILABLE", doc: null };
  }
  return parseObservation(raw);
}

/**
 * Re-read, merge, and write the next baseline.
 *
 * @param {{ getItem: (k: string) => string|null, setItem: (k: string, v: string) => void }} storage
 * @param {any} fresh   slices from READY owners (see mergeObservation)
 * @param {{ nowIso: string, firstOfSession?: boolean }} options
 * @returns {{ committed: boolean, wrote: boolean, reason: string|null, before: any, doc: any }}
 *          `before` is the document as it stood at commit time — the prior this session's deltas are judged against.
 */
export function commitObservation(storage, fresh, { nowIso, firstOfSession = false }) {
  const current = readObservation(storage);
  if (current.status === "UNAVAILABLE") return { committed: false, wrote: false, reason: "STORAGE_UNAVAILABLE", before: null, doc: null };
  if (current.status === "UNSUPPORTED_VERSION") return { committed: false, wrote: false, reason: "NEWER_SCHEMA", before: null, doc: null };
  const before = current.status === "OK" ? current.doc : null;
  const merged = mergeObservation(current.doc, fresh, { nowIso });
  if (!firstOfSession && current.status === "OK" && sameFacts(merged, current.doc)) {
    return { committed: true, wrote: false, reason: null, before, doc: current.doc };
  }
  try {
    storage.setItem(OBSERVATION_STORAGE_KEY, serializeObservation(merged));
  } catch {
    return { committed: false, wrote: false, reason: "WRITE_FAILED", before, doc: null };
  }
  return { committed: true, wrote: true, reason: null, before, doc: merged };
}

/** A storage event that may concern the observation (null key = storage cleared). Re-read; never trust the payload. */
export function isObservationStorageEvent(e) {
  return !!e && (e.key === OBSERVATION_STORAGE_KEY || e.key === null);
}
