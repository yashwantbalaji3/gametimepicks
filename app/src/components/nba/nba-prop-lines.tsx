/**
 * NBA player props: the official projection beside a verified sportsbook line (founder P0 2026-10-29) — the NBA wiring
 * of the sport-agnostic section (components/odds/prop-line-comparison.tsx, lib/odds/prop-line-view.mjs). SERVER only.
 *
 * GATE: NBA_LINE_DISPLAY.public (lib/sports/nba/line-board.mjs). While it is false — Production today — this component
 * returns null BEFORE reading anything, so /nba/projections, its dated pages and the game pages render exactly as they
 * did without it: no heading, no legend, no line, price or book (prop-line-switch-off.test.mjs).
 *
 * SOURCE: none is public. Price records live only in the private directory outside every repo (storage rule 10-22) and
 * no committed, sanitized NBA price file exists. `priceRecords` is therefore null on every page, and with the switch on
 * the section says "Sportsbook lines: Unavailable" rather than inventing a line. When the founder decides D3 (display
 * terms) and where published records live, the page passes them here — nothing else changes.
 */
import React from "react";
import PropLineComparison, { type PropLineViewModel } from "@/components/odds/prop-line-comparison";
import { NBA_LINE_DISPLAY } from "@/lib/sports/nba/line-board.mjs";
import { NBA_PROP_LINE_ADAPTER, nbaPropLineInputs } from "@/lib/sports/nba/prop-line-adapter.mjs";
import { buildPropLineViews } from "@/lib/odds/prop-line-view.mjs";
import { committedLaneDates, loadLaneForDate } from "@/components/nba/experimental-lane";

type LaneLike = { date: string | null; games: { providerEventId: string }[] } | null;

/** Game pages: the newest committed lane holding this game (resolved only when the section is shown). */
export const laneHoldingEvent = (eventId: string) => (): LaneLike => {
  for (const d of [...committedLaneDates()].sort().reverse()) {
    const l = loadLaneForDate(d);
    if (l?.games.some((g) => String(g.providerEventId) === String(eventId))) return l;
  }
  return null;
};

export default function NbaPropLines({ lane, eventId = null, priceRecords = null, asOf, display = NBA_LINE_DISPLAY, id = "nba-prop-lines" }: {
  /** The frozen lane snapshot the projections come from (or a function, so nothing is loaded while the switch is off).
      Omitted on a game page: the newest committed lane holding `eventId`. */
  lane?: LaneLike | (() => LaneLike);
  /** One game only (game pages); null = the whole slate. */
  eventId?: string | null;
  /** Verified price records (gtp.nba.prop-price@1). null = no public source (today). */
  priceRecords?: unknown[] | null;
  /** The comparison instant (default: the build's clock); comparisons freeze at tip-off. */
  asOf?: string;
  display?: { public: boolean };
  id?: string;
}) {
  if (!display.public) return null;
  const src = lane ?? (eventId != null ? laneHoldingEvent(eventId) : null);
  const snap = typeof src === "function" ? src() : src;
  const at = asOf || new Date().toISOString();
  if (!snap || (eventId != null && !snap.games.some((g) => String(g.providerEventId) === String(eventId)))) return null;
  const { inputs, withoutLine } = priceRecords ? nbaPropLineInputs({ lane: snap, priceRecords, asOf: at, eventId }) : { inputs: [], withoutLine: 0 };
  const view = buildPropLineViews(inputs, NBA_PROP_LINE_ADAPTER) as PropLineViewModel;
  return <PropLineComparison view={view} display={display} id={id} withoutLine={withoutLine} heading="Model vs. sportsbook line · NBA player props" />;
}
