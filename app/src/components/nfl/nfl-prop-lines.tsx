/**
 * NFL player props: the OFFICIAL board projection beside a verified sportsbook line — the NFL wiring of the
 * sport-agnostic section (components/odds/prop-line-comparison.tsx, lib/odds/prop-line-view.mjs). SERVER only.
 *
 * GATE: NFL_LINE_DISPLAY.public (lib/sports/nfl/line-display.mjs, derived from the display authorization record). While
 * it is false — every commit until the founder's reviewed NFL display decision — this component returns null BEFORE
 * reading anything, so the NFL game page renders byte-identically with or without it (nfl-prop-lines-switch-off.test.mjs).
 *
 * SCOPE: PUBLISHED families only (week 8: receptions, receiving yards; anytime touchdown as a yes/no price row, never an
 * OVER/UNDER). Passing and rushing yards are not official forecasts in week 8 and are not listed here at all.
 * SOURCE: offer rows read at build time by nflPublicLineRecords (null unless authorized; never under app/public). A
 * caller (a test, the private evidence render) may hand `offers` in directly.
 * DIRECTION: OVER / UNDER / NEUTRAL only for a direction-qualified family (publicDirectionGate("nfl")); all NFL families
 * are unqualified (receiving yards: median bias + skew; receptions: over-median share 0.42–0.45), so a comparable row is
 * "Comparison not shown" until the founder qualifies the family.
 */
import React from "react";
import PropLineComparison, { type PropLineViewModel } from "@/components/odds/prop-line-comparison";
import { NFL_LINE_DISPLAY } from "@/lib/sports/nfl/line-display.mjs";
import { NFL_FAMILIES, NFL_PROP_LINE_ADAPTER, nflPropLineInputs } from "@/lib/sports/nfl/prop-line-adapter.mjs";
import { buildPropLineViews } from "@/lib/odds/prop-line-view.mjs";
import { nflPublicLineRecords } from "@/lib/sports/nfl/public-line-records.mjs";
import { displayAuthorization, publicDirectionGate } from "@/lib/odds/display-authorization.mjs";
import { BOOK_AVAILABILITY_NOTE } from "@/lib/sports/odds/eligible-operators.mjs";

export type BoardLike = { providerEventId?: string; kickoffUtc?: string; families: Record<string, { state?: string }>; players: unknown[] } | null;

/** The board families that are official forecasts (PUBLISHED) → adapter families. */
export const publishedNflFamilies = (board: BoardLike): string[] =>
  Object.entries(NFL_FAMILIES).filter(([, d]) => board?.families?.[d.board]?.state === "PUBLISHED").map(([f]) => f);

export const NFL_YES_NO_NOTE = "Anytime touchdown is a yes/no market: the sportsbook's Yes price is shown for reference and is not compared with our probability.";

export default function NflPropLines({ board, offers = null, asOf, display = NFL_LINE_DISPLAY, directions = publicDirectionGate("nfl"), id = "nfl-prop-lines", heading = "Model vs. sportsbook line · NFL player props" }: {
  /** The official per-game player board (or a function, so nothing is loaded while the switch is off). */
  board: BoardLike | (() => BoardLike);
  /** Offer rows (nflOffersFromCapture shape). Omitted / null = the authorized build-time artifact for this game (if any). */
  offers?: unknown[] | null;
  /** The comparison instant (default: the build's clock); comparisons freeze at kickoff. */
  asOf?: string;
  display?: { public: boolean };
  /** The direction gate (lib/odds/prop-line-view.mjs). Default: the committed record's public gate (fail closed). */
  directions?: { scope?: string; shows: (family: string) => boolean };
  id?: string;
  heading?: string;
}) {
  if (!display.public) return null;
  const b = typeof board === "function" ? board() : board;
  if (!b) return null;
  const families = publishedNflFamilies(b);
  if (!families.length) return null;
  const at = asOf || new Date().toISOString();
  const rows = offers ?? (b.providerEventId ? nflPublicLineRecords(b.providerEventId) : null);
  const built = rows ? nflPropLineInputs({ board: b, offers: rows, asOf: at, families }) : null;
  const view = built ? (buildPropLineViews(built.inputs, NFL_PROP_LINE_ADAPTER, { projections: built.projections, directions }) as PropLineViewModel) : null;
  const attribution = offers == null && rows ? displayAuthorization("nfl", "site").attribution : null;
  const notes = rows ? [...(attribution ? [attribution] : []), ...(families.includes("anytime_td") ? [NFL_YES_NO_NOTE] : []), BOOK_AVAILABILITY_NOTE] : undefined;
  return <PropLineComparison view={view} display={display} id={id} withoutLine={built?.withoutLine ?? 0} notes={notes} heading={heading} />;
}

/**
 * The page hook: returns `node` ITSELF while the switch is off — the page's element tree (and therefore React's useId
 * values and every byte of HTML) is exactly what it was without this feature; an always-present <NflPropLines/> slot,
 * even one rendering null, would shift the useId of every later sibling. When on, `node` is followed by the section.
 */
export function withNflPropLines(node: React.ReactNode, board: BoardLike | (() => BoardLike), display: { public: boolean } = NFL_LINE_DISPLAY): React.ReactNode {
  if (!display.public) return node;
  return <>{node}<NflPropLines board={board} display={display} /></>;
}
