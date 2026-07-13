/**
 * FIFA World Cup 2026 knockout calendar — DATES ONLY, a matter of public record.
 *
 * This table exists so the site can honestly say "next up: World Cup semifinals
 * (Jul 14 & 15)" on an in-between day, WITHOUT fabricating matchups, odds, or
 * picks. Matchups depend on prior-round winners and are INTENTIONALLY omitted —
 * the "next focus" framing names the round and its dates, never the teams.
 *
 * Used by the public thin-slate framing (`slate-liveness` callers) to point at
 * the next scheduled round. Never drives money, products, or settlement.
 */
import type { NextFocus } from "./slate-liveness";

export interface WcRound {
  round: string;
  label: string;
  /** Earliest ET date of the round, YYYY-MM-DD. */
  date: string;
  /** Latest ET date if the round spans days, YYYY-MM-DD. */
  through?: string;
  /** Honest caveat about matchup availability. */
  note?: string;
}

/**
 * Public FIFA schedule for the 2026 knockout stage (US/CAN/MEX). Dates are the
 * published tournament calendar; team matchups are omitted on purpose.
 */
export const WC_2026_KNOCKOUT: readonly WcRound[] = [
  { round: "r32", label: "World Cup round of 32", date: "2026-06-28", through: "2026-07-03" },
  { round: "r16", label: "World Cup round of 16", date: "2026-07-04", through: "2026-07-07" },
  { round: "qf", label: "World Cup quarterfinals", date: "2026-07-09", through: "2026-07-11" },
  {
    round: "sf",
    label: "World Cup semifinals",
    date: "2026-07-14",
    through: "2026-07-15",
    note: "matchups set after the quarterfinals",
  },
  { round: "3p", label: "World Cup third-place playoff", date: "2026-07-18" },
  {
    round: "final",
    label: "World Cup final",
    date: "2026-07-19",
    note: "matchups set after the semifinals",
  },
];

/**
 * The next knockout round that has NOT yet finished, relative to `today` (ET).
 * A round is "still ahead / in progress" when its last date (`through` ?? `date`)
 * is on or after today. Returns null once the tournament is over.
 */
export function nextWorldCupFocus(today: string): NextFocus | null {
  const round = WC_2026_KNOCKOUT.find((r) => (r.through ?? r.date) >= today);
  if (!round) return null;
  return {
    label: round.label,
    date: round.date,
    through: round.through,
    note: round.note,
  };
}
