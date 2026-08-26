"use client";
/**
 * THE SLIP — a browser-local collection of legs a reader has picked out, with a paper stake each.
 *
 * Deliberately CLIENT-ONLY and browser-local:
 *   · nothing is transmitted anywhere, so a reader's selections are not a data collection surface;
 *   · nothing here settles, scores, or enters any ledger — the site's records are generated
 *     server-side from committed artifacts, and a slip a visitor assembled is not evidence of
 *     anything. It must never be able to move the paper record.
 *
 * Sport-agnostic on purpose. A leg is identified by a stable key rather than by anything MLB-shaped,
 * so the same slip carries an NFL or UFC selection the day those sports are eligible.
 */
import { useCallback, useEffect, useState } from "react";
import { legKey as canonicalLegKey, migrateSlipLegs, type SlipLegInput } from "@/lib/slip/leg-identity";
import { americanToDecimal, decimalToAmerican } from "@/lib/odds-math";

export interface SlipLeg extends SlipLegInput {
  /** Canonical identity — always `legKey(fields)`. See lib/slip/leg-identity for the one rule. */
  readonly key: string;
}

export interface SlipState {
  readonly legs: readonly SlipLeg[];
  /** Paper stake per leg key, in whole currency units. */
  readonly stakes: Readonly<Record<string, number>>;
}

const STORAGE_KEY = "gtp.slip.v1";
const EMPTY: SlipState = { legs: [], stakes: {} };
/** A slip is a shortlist, not a database. The cap keeps it usable and the storage small. */
export const SLIP_MAX_LEGS = 12;

/** Re-exported canonical identity rule (P208): one legKey for every surface. */
export const legKey = canonicalLegKey;

/** ONE odds implementation site-wide — these are odds-math's functions under the slip's names. */
export const decimalOdds = americanToDecimal;

/** Combined decimal price of every leg — what a single parlay across the whole slip would pay. */
export const combinedDecimal = (legs: readonly SlipLeg[]) =>
  legs.reduce((d, l) => d * decimalOdds(l.americanOdds), 1);

export const toAmerican = decimalToAmerican;

function read(): SlipState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as SlipState;
    if (!Array.isArray(parsed?.legs)) return EMPTY;
    // Re-key stored legs under the canonical identity rule and merge duplicates the old
    // matchup-dependent key allowed (P208) — a slip saved before the rule change stays usable.
    const migrated = migrateSlipLegs(parsed.legs as SlipLeg[], parsed.stakes ?? {});
    return { legs: migrated.legs.slice(0, SLIP_MAX_LEGS), stakes: migrated.stakes };
  } catch {
    return EMPTY;
  }
}

/** Broadcast within the tab; `storage` only fires cross-tab, so a same-tab listener needs this. */
const CHANNEL = "gtp:slip";
const publish = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANNEL)); };

export function useSlip() {
  /*
   * Starts EMPTY on both server and first client render, then loads after mount. Reading
   * localStorage during render would make the server and client markup disagree and throw a
   * hydration error on every page that mounts the slip.
   */
  const [state, setState] = useState<SlipState>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(read());
    setReady(true);
    const sync = () => setState(read());
    window.addEventListener(CHANNEL, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(CHANNEL, sync); window.removeEventListener("storage", sync); };
  }, []);

  const write = useCallback((next: SlipState) => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* private mode / quota — the slip is best-effort */ }
    setState(next);
    publish();
  }, []);

  const add = useCallback((leg: SlipLeg) => {
    const cur = read();
    if (cur.legs.some((l) => l.key === leg.key)) return;      // adding twice is a no-op, not a duplicate
    if (cur.legs.length >= SLIP_MAX_LEGS) return;
    /*
     * NO DEFAULT STAKE. A leg lands on the slip at zero and stays there until the reader types a
     * number. Pre-filling one — $10, or a unit derived from a stated bankroll — is the site
     * choosing a stake on their behalf and calling it their own, which is the thing this whole
     * feature is careful not to do.
     */
    write({ legs: [...cur.legs, leg], stakes: { ...cur.stakes, [leg.key]: cur.stakes[leg.key] ?? 0 } });
  }, [write]);

  const remove = useCallback((key: string) => {
    const cur = read();
    const { [key]: _dropped, ...stakes } = cur.stakes;
    write({ legs: cur.legs.filter((l) => l.key !== key), stakes });
  }, [write]);

  const setStake = useCallback((key: string, stake: number) => {
    const cur = read();
    write({ ...cur, stakes: { ...cur.stakes, [key]: Number.isFinite(stake) && stake >= 0 ? stake : 0 } });
  }, [write]);

  const clear = useCallback(() => write(EMPTY), [write]);

  const has = useCallback((key: string) => state.legs.some((l) => l.key === key), [state.legs]);

  return { ...state, ready, add, remove, setStake, clear, has };
}
