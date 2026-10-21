/**
 * A tiny external store for the per-frame scene state. The rAF loop writes here; only the small subtrees that read a
 * changing value (field overlay, clock, seek bar, timeline cursor) re-render each frame, and the rest of the island
 * re-renders only when a coarse key (drive, phase, score, chip) changes (spec §3.5).
 */
import { useSyncExternalStore } from "react";

export type FrameStore<T> = { get: () => T; set: (v: T) => void; subscribe: (fn: () => void) => () => void };

export function createFrameStore<T>(initial: T): FrameStore<T> {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set: (v: T) => {
      value = v;
      subs.forEach((fn) => fn());
    },
    subscribe: (fn: () => void) => {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}

/** Subscribe to a derived primitive; the component re-renders only when that primitive changes. */
export function useFrameValue<T, R extends string | number | boolean | null>(store: FrameStore<T>, select: (v: T) => R): R {
  return useSyncExternalStore(store.subscribe, () => select(store.get()), () => select(store.get()));
}
