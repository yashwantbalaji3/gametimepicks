/**
 * NBA compact "model vs sportsbook line" summaries for pages that LIST games (founder P0 2026-10-29): the /nba hub's game
 * cards and the /today NBA rows. SERVER only (nothing "use client" may import this: prop-line-switch-off.test.mjs).
 *
 * Same gate, same published source and same comparison as the full section (nba-prop-lines.tsx): while
 * NBA_LINE_DISPLAY.public is false (Production) both exports return before reading anything — the summary renders
 * nothing and the map is `undefined`, so the listing components get no prop and their markup is byte-identical
 * (prop-line-surfaces-switch-off.test.mjs). With the switch on, a game shows its OVER / UNDER / NEUTRAL counts and
 * "N of M projections have a qualified sportsbook line" only when at least one of its lines is compared — and a line is
 * "compared" publicly only for a direction-qualified family (publicDirectionGate("nba"); none today), so with the
 * committed record a summary never appears even when the switch is on.
 *
 * Kept apart from nba-prop-lines.tsx so a listing page's own imports name only this summary module.
 */
import React from "react";
import { NBA_LINE_DISPLAY } from "@/lib/sports/nba/line-board.mjs";
import { nbaGameLineSummaryView, PropLineSummary, type LaneLike } from "@/components/nba/nba-prop-lines";
import { publicDirectionGate } from "@/lib/odds/display-authorization.mjs";

type Directions = { scope?: string; shows: (family: string) => boolean };

/** One game's summary (or nothing). */
export function NbaPropLineSummary({ lane, eventId, href = null, priceRecords = null, asOf, display = NBA_LINE_DISPLAY, directions = publicDirectionGate("nba") }: {
  lane: LaneLike | (() => LaneLike);
  eventId: string;
  href?: string | null;
  priceRecords?: unknown[] | null;
  asOf?: string;
  display?: { public: boolean };
  directions?: Directions;
}) {
  if (!display.public) return null;
  const view = nbaGameLineSummaryView(typeof lane === "function" ? lane() : lane, eventId, priceRecords, asOf, directions);
  return view ? <PropLineSummary view={view} display={display} href={href} /> : null;
}

/**
 * Per-game summaries for a page that lists games. Returns `undefined` while the switch is off — the caller then passes
 * nothing and its markup is byte-identical to before (no extra child slot, no null).
 * @param games  [eventId, key the caller looks the summary up by, link to the full table or null]
 */
export function nbaPropLineSummaries({ lane, games, asOf, display = NBA_LINE_DISPLAY, priceRecords = null, directions = publicDirectionGate("nba") }: {
  lane: LaneLike | (() => LaneLike);
  games: ReadonlyArray<readonly [eventId: string, key: string, href: string | null]>;
  asOf?: string;
  display?: { public: boolean };
  priceRecords?: unknown[] | null;
  directions?: Directions;
}): ReadonlyMap<string, React.ReactNode> | undefined {
  if (!display.public) return undefined;
  const snap = typeof lane === "function" ? lane() : lane;
  if (!snap) return undefined;
  const out = new Map<string, React.ReactNode>();
  for (const [eventId, key, href] of games) {
    const view = nbaGameLineSummaryView(snap, eventId, priceRecords, asOf, directions);
    if (view) out.set(key, <PropLineSummary key={key} view={view} display={display} href={href} />);
  }
  return out.size ? out : undefined;
}
