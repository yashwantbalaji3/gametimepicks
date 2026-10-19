"use client";
/**
 * THE COMPARE SLIP'S BROWSER STORAGE — the one place `gtp.slip.v2` touches window.localStorage.
 *
 * Same category as the paper slip (lib/slip/slip-store.ts, `gtp.slip.v1`) and covered by the same privacy-notice
 * clause ("the picks in your slip … in your browser's local storage"): legs a reader chose, with the price each was
 * recorded at. Nothing is transmitted. Every rule lives in the pure module (./smart-slip.mjs); this hook only loads
 * after mount (no hydration mismatch), persists, and keeps a reader clock for the freshness bands.
 */
import { useCallback, useEffect, useState } from "react";
import { emptySlip, readSlip, writeSlip, slipFromCard, removeLeg, reorderLeg } from "@/lib/slip/smart-slip.mjs";

export interface SmartSlipLeg {
  readonly key: string;
  readonly eventId: string | null;
  readonly sport: string;
  readonly game: string | null;
  readonly market: string | null;
  readonly selection: string | null;
  readonly line: number | null;
  readonly book: string | null;
  readonly price: number | null;
  readonly capturedAt: string | null;
}
export interface SmartSlip {
  readonly version: 2;
  readonly legs: readonly SmartSlipLeg[];
  readonly pricingSnapshotId: string | null;
  readonly sourceCardId: string | null;
  readonly invalidatedBy: string | null;
}

const storage = (): Storage | null => {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
};

export function useSmartSlip() {
  const [slip, setSlip] = useState<SmartSlip>(emptySlip() as SmartSlip);
  /* null until mount: freshness is a fact about the reader's clock, never the server's. */
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    setSlip(readSlip(storage()) as SmartSlip);
    setNowMs(Date.now());
    const tick = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(tick);
  }, []);

  const commit = useCallback((next: SmartSlip) => {
    writeSlip(storage(), next);
    setSlip(next);
  }, []);

  const openCard = useCallback((card: unknown) => commit(slipFromCard(card) as SmartSlip), [commit]);
  const remove = useCallback((key: string) => commit(removeLeg(slip, key) as SmartSlip), [commit, slip]);
  const move = useCallback((from: number, to: number) => commit(reorderLeg(slip, from, to) as SmartSlip), [commit, slip]);
  const clear = useCallback(() => commit(emptySlip() as SmartSlip), [commit]);

  return { slip, nowMs, openCard, remove, move, clear };
}
