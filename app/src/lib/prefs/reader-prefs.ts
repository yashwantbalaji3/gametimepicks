"use client";
/**
 * READER PREFERENCES — a bankroll and a risk tolerance, stated by the reader, kept in their browser.
 *
 * ── The line this feature has to stay on ────────────────────────────────────────────────────────
 * Everything else on this site is the SAME OUTPUT FOR EVERY VISITOR, which is what makes "here is
 * our record" a checkable claim. Personalisation breaks that symmetry, so it is deliberately narrow:
 *
 *   · It FILTERS and it does ARITHMETIC. It never generates a recommendation.
 *     "You said $500 and low risk, and 2% of $500 is $10" is arithmetic on the reader's own numbers.
 *     "You should put $10 on this" is advice, and this module never produces that sentence.
 *   · It never invents a pick. The cards are the same published cards; a preference decides which of
 *     them is shown first, not what they are.
 *   · Because the measured record of this stream is NEGATIVE in every tier, stating a bankroll makes
 *     the record MORE prominent, not less — the honest personalisation of "−6.6% over 234 cards" is
 *     what that would have done to the reader's own number, not a friendlier framing of it.
 *
 * ── Browser-local, like the slip ────────────────────────────────────────────────────────────────
 * Nothing is transmitted. A bankroll is a sensitive number and this site has no account system, no
 * collection endpoint, and no reason to hold one. It lives in localStorage and nowhere else.
 */
import { useCallback, useEffect, useState } from "react";

export type RiskTolerance = "low" | "medium" | "high" | "longshot";

export interface ReaderPrefs {
  /** Paper bankroll the reader chose to state. Null = not set; the site behaves as it always did. */
  readonly bankroll: number | null;
  readonly risk: RiskTolerance | null;
  /** Percent of bankroll per card, as a whole number. Flat staking — no progression, ever. */
  readonly unitPct: number;
}

export const DEFAULT_PREFS: ReaderPrefs = { bankroll: null, risk: null, unitPct: 2 };

/**
 * Flat staking only, and capped.
 *
 * There is no Kelly here and no progression. Kelly sizing requires a genuine edge estimate, and the
 * measured record of this stream is negative in every tier — sizing "optimally" against an edge that
 * does not exist is how a staking formula turns a losing model into a faster loss. A progression
 * (double after a loss) would be worse still. So the only control is a flat percentage, and it stops
 * at 10 because beyond that the arithmetic stops describing anything a reader should model.
 */
export const UNIT_PCT_MIN = 1;
export const UNIT_PCT_MAX = 10;

const STORAGE_KEY = "gtp.prefs.v1";
const CHANNEL = "gtp:prefs";

const clampPct = (n: number) => Math.min(UNIT_PCT_MAX, Math.max(UNIT_PCT_MIN, Math.round(n)));

function read(): ReaderPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<ReaderPrefs>;
    const bankroll = typeof p.bankroll === "number" && Number.isFinite(p.bankroll) && p.bankroll > 0 ? p.bankroll : null;
    const risk = (["low", "medium", "high", "longshot"] as const).includes(p.risk as RiskTolerance) ? (p.risk as RiskTolerance) : null;
    return { bankroll, risk, unitPct: clampPct(Number(p.unitPct ?? DEFAULT_PREFS.unitPct)) };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** One unit, in currency. Pure arithmetic on the reader's own two numbers. */
export const unitStake = (prefs: ReaderPrefs): number | null =>
  prefs.bankroll == null ? null : Math.round((prefs.bankroll * prefs.unitPct) / 100 * 100) / 100;

/**
 * What a tier's MEASURED return would have done to this bankroll, at one unit per card.
 *
 * Deliberately expressed as a completed past ("would have"), never a projection. It is the tier's
 * own settled ROI applied to the reader's stated numbers — no forecast, no expectation, and for
 * every tier currently published it is a loss.
 */
export function bankrollOutcome(prefs: ReaderPrefs, roi: number | null, cards: number): number | null {
  const unit = unitStake(prefs);
  if (unit == null || roi == null || !cards) return null;
  return Math.round(unit * cards * roi * 100) / 100;
}

export function useReaderPrefs() {
  // Starts at defaults on server and first client render, then loads — reading localStorage during
  // render would desync the markup and throw a hydration error.
  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPrefs(read());
    setReady(true);
    const sync = () => setPrefs(read());
    window.addEventListener(CHANNEL, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(CHANNEL, sync); window.removeEventListener("storage", sync); };
  }, []);

  const update = useCallback((patch: Partial<ReaderPrefs>) => {
    const next: ReaderPrefs = { ...read(), ...patch };
    const clean: ReaderPrefs = {
      bankroll: next.bankroll != null && next.bankroll > 0 ? next.bankroll : null,
      risk: next.risk ?? null,
      unitPct: clampPct(next.unitPct),
    };
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean)); } catch { /* private mode */ }
    setPrefs(clean);
    window.dispatchEvent(new Event(CHANNEL));
  }, []);

  const clear = useCallback(() => {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* private mode */ }
    setPrefs(DEFAULT_PREFS);
    window.dispatchEvent(new Event(CHANNEL));
  }, []);

  return { prefs, ready, update, clear, unit: unitStake(prefs) };
}
