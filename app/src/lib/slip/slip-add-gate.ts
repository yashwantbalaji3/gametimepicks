/**
 * THE SLIP-ADD GATE — one rule, every sport, for whether a leg may go onto a reader's slip.
 *
 * Audit 2026-10-28: /mlb offered "+ Slip" on MIL@TB the day after first pitch (the hub itself listed
 * the game as STARTED), and the leg rode into /build/custom as a priced card leg. A static page ages;
 * only the reader's clock can say whether a selection is still pre-game. So the add path re-checks
 * the leg's own start time (read from the data the page was built from, never from UI text) against
 * the reader's clock, by THE ONE START RULE (`legHasStarted`, lib/parlays/explorer-legs).
 *
 * This gates ADDING to the slip and how an existing slip item is shown. It does not change any
 * product's own eligibility engine, threshold or grading.
 *
 *   · a leg with a start at/before now has started (an unparseable start fails closed: started);
 *   · a leg carrying a game state that is not pre-game has started, whatever its clock says;
 *   · a leg carrying NO start and no state is not provably started — the gate refuses only what the
 *     data proves, and never labels a game "Started" without a start time to say so.
 *
 * Pure (no react, no fs), so stores, buttons and tests share the exact same rule.
 */
import { legHasStarted } from "@/lib/parlays/explorer-legs";

/** What a slip item for a started game says, wherever the slip renders it. */
export const STARTED_UNAVAILABLE = "Started — no longer available";

/** Game states that are still pre-game. Anything else a leg carries (live, final, postponed…) is not. */
const PREGAME_STATES: ReadonlySet<string> = new Set(["pre", "pregame", "scheduled", "upcoming", "not_started", "status_scheduled"]);

export interface SlipStartFacts {
  readonly startUtc?: string | null;
  readonly state?: string | null;
}

/** Has this leg's game started as of `nowIso`? See the module note for the three cases. */
export function slipLegStarted(leg: SlipStartFacts | null | undefined, nowIso: string): boolean {
  const state = leg?.state == null ? "" : String(leg.state).trim().toLowerCase();
  if (state && !PREGAME_STATES.has(state)) return true;
  const start = leg?.startUtc;
  if (start == null || start === "") return false;
  return legHasStarted(start, nowIso);
}

/** May this leg be added to a slip now? The inverse of `slipLegStarted`, named for the add path. */
export function canAddToSlip(leg: SlipStartFacts | null | undefined, nowIso: string): boolean {
  return !slipLegStarted(leg, nowIso);
}
