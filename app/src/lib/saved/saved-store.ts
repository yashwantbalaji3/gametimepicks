"use client";
/**
 * SAVED FORECASTS — the browser-local store hook (P310). Same shape as lib/follow/follow-store.ts and for the same
 * reasons: nothing leaves the browser, nothing here can reach a published record, and the page starts empty on the
 * server so hydration cannot disagree. The rules live in saved-schema.mjs; this file only reads, writes and syncs.
 */
import { useCallback, useEffect, useState } from "react";
import { SAVED_CHANNEL, SAVED_STORAGE_KEY, parseStore, serializeStore, snapshotFromCard, upsert, remove } from "./saved-schema.mjs";
import type { PredictionCardModel } from "@/lib/command-center/contract";

export interface SavedForecast {
  schemaVersion: number;
  id: string;
  sport: string;
  href: string;
  startUtc: string | null;
  matchup: string;
  context: string | null;
  family: string;
  value: string;
  sub: string | null;
  signal: string | null;
  modelState: string;
  modelFamily: string | null;
  updatedAt: string | null;
  settlement: PredictionCardModel["settlement"];
  savedAt: string;
  sourceRoute: string;
}

const publish = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(SAVED_CHANNEL)); };
function read(): SavedForecast[] {
  if (typeof window === "undefined") return [];
  try { return parseStore(window.localStorage.getItem(SAVED_STORAGE_KEY)) as SavedForecast[]; } catch { return []; }
}

export function useSavedForecasts() {
  const [items, setItems] = useState<SavedForecast[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setItems(read());
    setReady(true);
    const sync = () => setItems(read());
    window.addEventListener(SAVED_CHANNEL, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(SAVED_CHANNEL, sync); window.removeEventListener("storage", sync); };
  }, []);

  const write = useCallback((next: SavedForecast[]) => {
    try { window.localStorage.setItem(SAVED_STORAGE_KEY, serializeStore(next)); } catch { /* private mode or quota — saving is best-effort by design */ }
    setItems(next);
    publish();
  }, []);

  const save = useCallback((card: PredictionCardModel) => {
    const snapshot = snapshotFromCard(card, { savedAt: new Date().toISOString(), sourceRoute: typeof window !== "undefined" ? window.location.pathname : "/" }) as SavedForecast;
    write(upsert(read(), snapshot) as SavedForecast[]);
  }, [write]);

  const unsave = useCallback((id: string) => { write(remove(read(), id) as SavedForecast[]); }, [write]);
  const isSaved = useCallback((id: string) => items.some((i) => i.id === id), [items]);

  return { items, ready, save, unsave, isSaved, clear: () => write([]) };
}
