"use client";
/**
 * useViewMode — the one hook every surface asks "Simple or Analyst?". Rules live in view-mode-core.mjs.
 *
 * ⚠ HYDRATION: the mode is the DEFAULT on the server and on the first client render, and only then
 *   loads from the device. Reading storage during render would make the server HTML and the first
 *   client render disagree (#418 → #423). An Analyst reader therefore sees the Simple paint first and
 *   the extra detail a moment later — never a different number.
 */
import { useCallback, useEffect, useState } from "react";

import {
  DEFAULT_VIEW_MODE, VIEW_MODE_CHANNEL, VIEW_MODE_STORAGE_KEY, readViewMode, writeViewMode,
} from "./view-mode-core.mjs";

export type ViewMode = "simple" | "analyst";

const store = (): Storage | null => {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
};

export function useViewMode() {
  const [mode, setModeState] = useState<ViewMode>(DEFAULT_VIEW_MODE as ViewMode);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setModeState(readViewMode(store()) as ViewMode);
    sync();
    setReady(true);
    const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === VIEW_MODE_STORAGE_KEY) sync(); };
    window.addEventListener(VIEW_MODE_CHANNEL, sync);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(VIEW_MODE_CHANNEL, sync); window.removeEventListener("storage", onStorage); };
  }, []);

  const setMode = useCallback((next: ViewMode) => {
    setModeState(writeViewMode(store(), next) as ViewMode);
    window.dispatchEvent(new Event(VIEW_MODE_CHANNEL));
  }, []);

  /* `isAnalyst` is true only once the device's choice has loaded — never on the server render. */
  return { mode, ready, isAnalyst: ready && mode === "analyst", setMode };
}
