"use client";
/**
 * THE MODEL SLIP'S BROWSER STORAGE — the one place `gtp.slip.model.v1` touches window.localStorage. Same category as
 * the paper slip and the Smart Betslip (the picks a reader chose, kept in this browser; nothing is transmitted). Every
 * rule lives in the pure module (./slip.mjs); this only shares one copy of the slip across every button and the bar on
 * a page, keeps tabs in step through the storage event, and loads after mount (the server render is an empty slip).
 */
import { useSyncExternalStore } from "react";
import { MODEL_SLIP_STORAGE_KEY, addSlipLegs, clearModelSlip, emptyModelSlip, readModelSlip, removeSlipLeg, reorderSlipLeg, writeModelSlip } from "./slip.mjs";

type Slip = { version: number; legs: Array<{ key: string } & Record<string, unknown>> };
const SERVER: Slip = emptyModelSlip() as Slip;
let current: Slip | null = null;
const listeners = new Set<() => void>();
/** The page's slip legs, sent ONCE (by the bar) so every button carries only leg keys. */
const catalog = new Map<string, unknown>();
export function registerSlipCatalog(legs: Array<{ key: string }>) { for (const l of legs) catalog.set(l.key, l); }

function storage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}
function get(): Slip {
  if (current == null) current = readModelSlip(storage()) as Slip;
  return current;
}
function set(next: Slip) {
  if (next === current) return;
  current = next;
  writeModelSlip(storage(), next);
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => { if (e.key === MODEL_SLIP_STORAGE_KEY) { current = readModelSlip(storage()) as Slip; for (const x of listeners) x(); } };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); if (typeof window !== "undefined") window.removeEventListener("storage", onStorage); };
}

export function useModelSlip() {
  const slip = useSyncExternalStore(subscribe, get, () => SERVER);
  return {
    slip,
    add: (keys: string[]) => set(addSlipLegs(get(), keys.map((k) => catalog.get(k)).filter(Boolean)) as Slip),
    remove: (key: string) => set(removeSlipLeg(get(), key) as Slip),
    move: (from: number, to: number) => set(reorderSlipLeg(get(), from, to) as Slip),
    clear: () => set(clearModelSlip() as Slip),
  };
}
