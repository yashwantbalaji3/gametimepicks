/**
 * NBA player props: the official projection beside a verified sportsbook line (founder P0 2026-10-29) — the NBA wiring
 * of the sport-agnostic section (components/odds/prop-line-comparison.tsx, lib/odds/prop-line-view.mjs). SERVER only.
 *
 * GATE: NBA_LINE_DISPLAY.public (lib/sports/nba/line-board.mjs). While it is false — Production today — this component
 * returns null BEFORE reading anything, so /nba/projections, its dated pages and the game pages render exactly as they
 * did without it: no heading, no legend, no line, price or book (prop-line-switch-off.test.mjs).
 *
 * SOURCE: the published comparison artifact (`gtp.nba.line-comparisons@1`), read at build time by nbaPublicLineRecords
 * (lib/sports/nba/public-line-records.mjs) — a build input OUTSIDE app/public (data/odds-display/nba/lines/<date>.json or
 * GTP_NBA_LINES_DIR), rendered into this HTML and never served as a file. The reader returns null unless the display
 * authorization record (lib/odds/display-authorization.mjs) authorizes the "site" surface AND an artifact exists for the
 * lane's date; then the section says "Sportsbook lines: Unavailable" rather than inventing a line. A caller (a test) may
 * still hand `priceRecords` in directly; omitted or null means "read the published artifact".
 *
 * DIRECTION: OVER / UNDER / NEUTRAL only for a family the display authorization record direction-qualifies
 * (publicDirectionGate("nba")); every other comparable row is "Comparison not shown". All families unqualified today.
 */
import React from "react";
import PropLineComparison, { PropLineSummary, type PropLineViewModel } from "@/components/odds/prop-line-comparison";
import { NBA_LINE_DISPLAY } from "@/lib/sports/nba/line-board.mjs";
import { NBA_PROP_LINE_ADAPTER, nbaPropLineInputs } from "@/lib/sports/nba/prop-line-adapter.mjs";
import { buildPropLineViews } from "@/lib/odds/prop-line-view.mjs";
import { committedLaneDates, loadLaneForDate } from "@/components/nba/experimental-lane";
import { nbaPublicLineRecords } from "@/lib/sports/nba/public-line-records.mjs";
import { displayAuthorization, publicDirectionGate } from "@/lib/odds/display-authorization.mjs";
import { BOOK_AVAILABILITY_NOTE } from "@/lib/sports/odds/eligible-operators.mjs";

type LaneLike = { date: string | null; games: { providerEventId: string }[] } | null;

/** Game pages: the newest committed lane holding this game (resolved only when the section is shown). */
export const laneHoldingEvent = (eventId: string) => (): LaneLike => {
  for (const d of [...committedLaneDates()].sort().reverse()) {
    const l = loadLaneForDate(d);
    if (l?.games.some((g) => String(g.providerEventId) === String(eventId))) return l;
  }
  return null;
};

export default function NbaPropLines({ lane, eventId = null, priceRecords = null, asOf, display = NBA_LINE_DISPLAY, directions = publicDirectionGate("nba"), id = "nba-prop-lines" }: {
  /** The frozen lane snapshot the projections come from (or a function, so nothing is loaded while the switch is off).
      Omitted on a game page: the newest committed lane holding `eventId`. */
  lane?: LaneLike | (() => LaneLike);
  /** One game only (game pages); null = the whole slate. */
  eventId?: string | null;
  /** Verified price records (gtp.nba.prop-price@1). Omitted / null = the published artifact for the lane's date (if any). */
  priceRecords?: unknown[] | null;
  /** The comparison instant (default: the build's clock); comparisons freeze at tip-off. */
  asOf?: string;
  display?: { public: boolean };
  /** The direction gate (lib/odds/prop-line-view.mjs). Default: the committed record's public gate (fail closed). */
  directions?: { scope?: string; shows: (family: string) => boolean };
  id?: string;
}) {
  if (!display.public) return null;
  const src = lane ?? (eventId != null ? laneHoldingEvent(eventId) : null);
  const snap = typeof src === "function" ? src() : src;
  const at = asOf || new Date().toISOString();
  if (!snap || (eventId != null && !snap.games.some((g) => String(g.providerEventId) === String(eventId)))) return null;
  const published = priceRecords ?? (snap.date ? nbaPublicLineRecords(snap.date) : null);
  // No published source → view null: the section says the lines are unavailable (provider / source state), never a row.
  const { inputs, withoutLine, projections } = published ? nbaPropLineInputs({ lane: snap, priceRecords: published, asOf: at, eventId }) : { inputs: [], withoutLine: 0, projections: 0 };
  const view = published ? (buildPropLineViews(inputs, NBA_PROP_LINE_ADAPTER, { projections, directions }) as PropLineViewModel) : null;
  // Lines read from the published artifact carry the authorization's attribution (optional) and the book-availability note.
  const attribution = priceRecords == null && published ? displayAuthorization("nba", "site").attribution : null;
  const notes = priceRecords == null && published ? [...(attribution ? [attribution] : []), BOOK_AVAILABILITY_NOTE] : undefined;
  return <PropLineComparison view={view} display={display} id={id} withoutLine={withoutLine} notes={notes} heading="Model vs. sportsbook line · NBA player props" />;
}

/** The one game's view for the compact summary, or null when there is no published source or no COMPARED row (the
    summary then shows nothing). Used by nba-prop-line-summaries.tsx; call only behind the display gate. */
export function nbaGameLineSummaryView(snap: LaneLike, eventId: string, priceRecords: unknown[] | null, asOf?: string, directions: { scope?: string; shows: (family: string) => boolean } = publicDirectionGate("nba")): PropLineViewModel | null {
  if (!snap || !snap.games.some((g) => String(g.providerEventId) === String(eventId))) return null;
  const published = priceRecords ?? (snap.date ? nbaPublicLineRecords(snap.date) : null);
  if (!published) return null;
  const { inputs, projections } = nbaPropLineInputs({ lane: snap, priceRecords: published, asOf: asOf || new Date().toISOString(), eventId });
  const view = buildPropLineViews(inputs, NBA_PROP_LINE_ADAPTER, { projections, directions }) as PropLineViewModel;
  return view.counts.compared > 0 ? view : null;
}
export type { LaneLike };
export { PropLineSummary };
