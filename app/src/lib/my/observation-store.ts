"use client";
/**
 * DEVICE OBSERVATION — the browser hook (v1.1.4). Reads, re-reads and commits; every RULE lives in
 * `observation-schema.mjs` / `since.mjs` and every storage interaction in `observation-browser.mjs`.
 *
 * WHAT HAS NOT CHANGED, AND MUST NOT:
 *   - nothing is transmitted. The observation is evidence about THIS device, kept on this device.
 *   - nothing here is sports truth. It records what was observed; the owners say what is true.
 *   - the server render and the first client render know nothing (status LOADING), so hydration cannot disagree.
 *
 * SESSION PRIOR. Until this session's first successful commit, `prior` follows storage (another tab may commit
 * first — then its deltas are already seen, and this tab must not show them again). The first commit re-reads
 * storage, and the document it found becomes this session's prior, frozen: the reader keeps seeing what changed
 * since their last visit for as long as this page stays open.
 *
 * VISIBILITY. `visible` tracks document.visibilityState; the page's commit gate refuses while hidden, so a
 * background tab never consumes updates nobody saw. Becoming visible re-reads before anything commits.
 *
 * NO WRITE STORM. A failed write stops further attempts for this session and is reported, never retried in a loop.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { commitObservation, isObservationStorageEvent, readObservation } from "./observation-browser.mjs";

export type ObservationStatus = "LOADING" | "EMPTY" | "OK" | "CORRUPT" | "UNSUPPORTED_VERSION" | "UNAVAILABLE";

/** localStorage, or null when even ACCESSING it throws (some sandboxed iframes do). */
function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export interface UseObservation {
  status: ObservationStatus;
  /** The document this session's deltas are judged against; null ⇒ no trustworthy prior (a baseline visit). */
  prior: any | null;
  visible: boolean;
  /** True once this session's baseline commit succeeded. */
  committed: boolean;
  writeFailed: boolean;
  commit: (fresh: any) => void;
}

export function useObservation(): UseObservation {
  const [status, setStatus] = useState<ObservationStatus>("LOADING");
  const [prior, setPrior] = useState<any | null>(null);
  const [visible, setVisible] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [writeFailed, setWriteFailed] = useState(false);
  const committedRef = useRef(false);
  const failedRef = useRef(false);

  const reread = useCallback(() => {
    const st = storage();
    const r = st ? readObservation(st) : { status: "UNAVAILABLE", doc: null };
    setStatus(r.status as ObservationStatus);
    if (!committedRef.current) setPrior(r.status === "OK" ? r.doc : null);
  }, []);

  useEffect(() => {
    reread();
    const onVisibility = () => {
      const v = document.visibilityState === "visible";
      if (v && !committedRef.current) reread();
      setVisible(v);
    };
    const onStorage = (e: StorageEvent) => {
      if (isObservationStorageEvent(e)) reread(); // a hint only — the payload is never read
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onStorage);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
    };
  }, [reread]);

  const commit = useCallback((fresh: any) => {
    if (failedRef.current) return;
    const st = storage();
    if (!st) { setStatus("UNAVAILABLE"); return; }
    const first = !committedRef.current;
    const r = commitObservation(st, fresh, { nowIso: new Date().toISOString(), firstOfSession: first });
    if (!r.committed) {
      if (r.reason === "WRITE_FAILED") { failedRef.current = true; setWriteFailed(true); }
      else setStatus(r.reason === "NEWER_SCHEMA" ? "UNSUPPORTED_VERSION" : "UNAVAILABLE");
      return;
    }
    if (first) {
      committedRef.current = true;
      setPrior(r.before);
      setCommitted(true);
    }
    setStatus("OK");
  }, []);

  return { status, prior, visible, committed, writeFailed, commit };
}
