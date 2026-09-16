"use client";
/**
 * FOLLOWING — the browser hook (v1.1.2). Reads, writes and syncs; every RULE lives in
 * `follow-schema.mjs` and every storage interaction in `follow-browser.mjs`.
 *
 * Originally P251 · F9, which keyed follows on a club's display name. v1.1.2 keys them on canonical
 * ids and migrates the old names forward without deleting them (see follow-schema.mjs).
 *
 * WHAT HAS NOT CHANGED, AND MUST NOT:
 *   - nothing is transmitted. A reader's interests are never a data-collection surface.
 *   - nothing here can reach a record. Following changes what a reader is shown FIRST — never what is
 *     published, forecast, evaluated or settled.
 *   - the page starts EMPTY on the server and on the first client render, and loads in an effect, so
 *     static HTML is identical for every reader and hydration cannot disagree.
 */
import { useCallback, useEffect, useState } from "react";

import { FOLLOW_CHANNEL, emptyDocument, isFollowing as isFollowingPure, listFollowed } from "./follow-schema.mjs";
import { applyFollowing, isFollowingStorageEvent, readFollowing } from "./follow-browser.mjs";

export type FollowSport = "MLB" | "NFL";
export type FollowEntityType = "team" | "player";

export interface FollowRef {
  sport: FollowSport;
  entityType: FollowEntityType;
  id: string;
  /** Display HINT only — never identity. */
  label?: string;
}

/** OK/EMPTY/CORRUPT are usable. UNAVAILABLE and UNSUPPORTED_VERSION disable writes, honestly. */
export type FollowStatus = "LOADING" | "OK" | "EMPTY" | "CORRUPT" | "UNAVAILABLE" | "UNSUPPORTED_VERSION";

interface Doc {
  schemaVersion: number;
  followed: FollowRef[];
  updatedAt: string | null;
}

const publish = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(FOLLOW_CHANNEL));
};

/** localStorage, or null when even ACCESSING it throws (some sandboxed iframes do). */
function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export interface UseFollowing {
  followed: FollowRef[];
  /** False until the first read completes — render neutral, not "Follow", before then. */
  ready: boolean;
  status: FollowStatus;
  /** Can a follow/unfollow succeed right now? False when storage is blocked or the schema is newer. */
  writable: boolean;
  /** P251 names that could not be resolved to a canonical id on this page. Reported, never dropped. */
  unresolvedLegacy: number;
  isFollowing: (ref: FollowRef | null | undefined) => boolean;
  toggle: (ref: FollowRef | null | undefined) => void;
  unfollow: (ref: FollowRef | null | undefined) => void;
  clear: () => void;
  list: (filter?: { sport?: FollowSport; entityType?: FollowEntityType }) => FollowRef[];
}

/**
 * @param legacyMap P251 display name → canonical ref. Pass it on pages where legacy follows were
 *                  created or are managed; without it, legacy names are counted and left alone.
 */
export function useFollowing({ legacyMap }: { legacyMap?: Record<string, FollowRef> | null } = {}): UseFollowing {
  const [doc, setDoc] = useState<Doc>(emptyDocument() as Doc);
  const [status, setStatus] = useState<FollowStatus>("LOADING");
  const [unresolvedLegacy, setUnresolvedLegacy] = useState(0);

  const load = useCallback(() => {
    const s = storage();
    if (!s) {
      setStatus("UNAVAILABLE");
      return;
    }
    const r = readFollowing(s, { legacyMap: legacyMap ?? null, nowIso: new Date().toISOString() });
    setDoc(r.doc as Doc);
    setStatus(r.status as FollowStatus);
    setUnresolvedLegacy(r.unresolvedLegacy ?? 0);
    if (r.migrated) publish(); // other mounted consumers pick up the migrated document
  }, [legacyMap]);

  useEffect(() => {
    load();
    const onChannel = () => load();
    const onStorage = (e: StorageEvent) => {
      // The event's newValue is never trusted — it only tells us to re-read through the contract.
      if (isFollowingStorageEvent(e)) load();
    };
    window.addEventListener(FOLLOW_CHANNEL, onChannel);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(FOLLOW_CHANNEL, onChannel);
      window.removeEventListener("storage", onStorage);
    };
  }, [load]);

  const run = useCallback((op: "follow" | "unfollow" | "clear", ref?: FollowRef | null) => {
    const s = storage();
    if (!s) {
      setStatus("UNAVAILABLE");
      return;
    }
    const r = applyFollowing(s, op, { ref: ref ?? null, nowIso: new Date().toISOString(), legacyMap: legacyMap ?? null });
    setDoc(r.doc as Doc);
    setStatus(r.status as FollowStatus);
    if (r.changed) publish();
  }, [legacyMap]);

  const isFollowing = useCallback((ref: FollowRef | null | undefined) => (ref ? isFollowingPure(doc, ref) : false), [doc]);

  const toggle = useCallback((ref: FollowRef | null | undefined) => {
    if (!ref) return;
    run(isFollowingPure(doc, ref) ? "unfollow" : "follow", ref);
  }, [doc, run]);

  return {
    followed: doc.followed,
    ready: status !== "LOADING",
    status,
    writable: status === "OK" || status === "EMPTY" || status === "CORRUPT",
    unresolvedLegacy,
    isFollowing,
    toggle,
    unfollow: (ref) => { if (ref) run("unfollow", ref); },
    clear: () => run("clear"),
    list: (filter) => listFollowed(doc, filter ?? {}) as FollowRef[],
  };
}
