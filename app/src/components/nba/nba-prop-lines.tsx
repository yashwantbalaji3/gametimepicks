/**
 * NBA player props: the official projection beside a verified sportsbook line (founder P0 2026-10-29) — the NBA wiring
 * of the sport-agnostic section (components/odds/prop-line-comparison.tsx, lib/odds/prop-line-view.mjs). SERVER only.
 *
 * GATE: NBA_LINE_DISPLAY.public (lib/sports/nba/line-board.mjs; "site" authorized by the founder 2026-10-29). While it is
 * false this component returns null BEFORE reading anything, so /nba/projections, its dated pages and the game pages
 * render exactly as they did without it: no heading, no legend, no line, price or book (prop-line-switch-off.test.mjs).
 *
 * SOURCE: the published comparison artifact (`gtp.nba.line-comparisons@1`), read at build time by nbaPublicLineRecords
 * (lib/sports/nba/public-line-records.mjs) — a build input OUTSIDE app/public (data/odds-display/nba/lines/<date>.json or
 * GTP_NBA_LINES_DIR), rendered into this HTML and never served as a file. The reader returns null unless the display
 * authorization record (lib/odds/display-authorization.mjs) authorizes the "site" surface, the display key is present
 * AND an artifact (encrypted under that key) exists for the lane's date.
 * NO ARTIFACT → NOTHING: with the switch on but no readable artifact (no key — every CI build —, another key, or a
 * historical date that never had one) this component returns null, so the page is byte-identical to the switch-off
 * render (prop-line-surfaces-switch-off.test.mjs). The "Sportsbook lines: Unavailable" state is kept for an artifact that
 * EXISTS but has no usable line for these projections. A caller (a test) may still hand `priceRecords` in directly;
 * omitted or null means "read the published artifact".
 *
 * DIRECTION: OVER / UNDER / NEUTRAL only for a family the display authorization record direction-qualifies
 * (publicDirectionGate("nba")); every other comparable row is "Comparison not shown". Qualified (founder 2026-10-29):
 * pts, reb, ast, pra, ptsReb, ptsAst; threePm is not.
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
import { nbaLinesPageHref } from "@/components/nba/game-page-link.mjs";

type LaneLike = { date: string | null; games: { providerEventId: string }[] } | null;

/** Game pages: the newest committed lane holding this game (resolved only when the section is shown). */
export const laneHoldingEvent = (eventId: string) => (): LaneLike => {
  for (const d of [...committedLaneDates()].sort().reverse()) {
    const l = loadLaneForDate(d);
    if (l?.games.some((g) => String(g.providerEventId) === String(eventId))) return l;
  }
  return null;
};

export default function NbaPropLines({ lane, eventId = null, priceRecords = null, asOf, display = NBA_LINE_DISPLAY, directions = publicDirectionGate("nba"), id = "nba-prop-lines", linesPage = false }: {
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
  /** GAME PAGES (page weight 2026-10-30): print the compact summary linking the game's /nba/lines/<id>/ page in place of
      the per-player table. `true` = that page's own existence rule (nbaLinesPageHrefFor); a function = an injected
      resolver (tests). When the game has no lines page (no compared line) the full table is printed as before, so no
      record is ever hidden. */
  linesPage?: boolean | ((eventId: string) => string | null);
}) {
  if (!display.public) return null;
  const src = lane ?? (eventId != null ? laneHoldingEvent(eventId) : null);
  const snap = typeof src === "function" ? src() : src;
  const at = asOf || new Date().toISOString();
  if (!snap || (eventId != null && !snap.games.some((g) => String(g.providerEventId) === String(eventId)))) return null;
  const published = priceRecords ?? (snap.date ? nbaPublicLineRecords(snap.date) : null);
  // No published source (no artifact for this date, no key, another key) → NOTHING: byte-identical to the switch-off page.
  if (!published) return null;
  const { inputs, withoutLine, projections } = nbaPropLineInputs({ lane: snap, priceRecords: published, asOf: at, eventId });
  const view = buildPropLineViews(inputs, NBA_PROP_LINE_ADAPTER, { projections, directions }) as PropLineViewModel;
  // Lines read from the published artifact carry the authorization's attribution (optional) and the book-availability note.
  const attribution = priceRecords == null ? displayAuthorization("nba", "site").attribution : null;
  const notes = priceRecords == null ? [...(attribution ? [attribution] : []), BOOK_AVAILABILITY_NOTE] : undefined;
  const heading = "Model vs. sportsbook line · NBA player props";
  if (linesPage && eventId != null && view.counts.compared > 0) {
    const href = typeof linesPage === "function" ? linesPage(String(eventId)) : nbaLinesPageHrefFor(String(eventId), at);
    // the same coverage line, legend and notes; the per-player rows live on the lines page only
    if (href) return <PropLineComparison view={view} display={display} id={id} withoutLine={withoutLine} notes={notes} heading={heading}><PropLineSummary view={view} display={display} href={href} label="This game" /></PropLineComparison>;
  }
  return <PropLineComparison view={view} display={display} id={id} withoutLine={withoutLine} notes={notes} heading={heading} />;
}

/**
 * The SLATE section (/nba/projections and its dated pages; page weight 2026-10-29): the same gate, source, coverage line
 * (true denominator: every projection on the slate), legend and notes as the full section — but in place of the
 * per-player table, ONE compact summary per game (nbaGameLineSummaryView → PropLineSummary) linking to that game's full
 * table on its /nba/lines/<id>/ page. A whole-slate table was ~4 KB per row with the RSC payload (977 KB at 236 rows); the per-player
 * rows live on the per-game lines pages only. The section keeps the id "nba-prop-lines". `hrefOf(eventId)`: the lines page link (nbaPropLinesHref over nbaLinesPageIds, else null: no link, never a
 * dead one).
 */
export function NbaSlatePropLines({ lane, priceRecords = null, asOf, display = NBA_LINE_DISPLAY, directions = publicDirectionGate("nba"), hrefOf = () => null, id = "nba-prop-lines" }: {
  lane: LaneLike | (() => LaneLike);
  priceRecords?: unknown[] | null;
  asOf?: string;
  display?: { public: boolean };
  directions?: { scope?: string; shows: (family: string) => boolean };
  hrefOf?: (eventId: string) => string | null;
  id?: string;
}) {
  if (!display.public) return null;
  const snap = typeof lane === "function" ? lane() : lane;
  if (!snap) return null;
  const published = priceRecords ?? (snap.date ? nbaPublicLineRecords(snap.date) : null);
  // No published source (no artifact for this date, no key, another key) → NOTHING: byte-identical to the switch-off page.
  if (!published) return null;
  const at = asOf || new Date().toISOString();
  const { inputs, withoutLine, projections } = nbaPropLineInputs({ lane: snap, priceRecords: published, asOf: at });
  const view = buildPropLineViews(inputs, NBA_PROP_LINE_ADAPTER, { projections, directions }) as PropLineViewModel;
  const attribution = priceRecords == null ? displayAuthorization("nba", "site").attribution : null;
  const notes = priceRecords == null ? [...(attribution ? [attribution] : []), BOOK_AVAILABILITY_NOTE] : undefined;
  const games = (snap.games as Array<{ providerEventId: string; away?: { abbr?: string | null; name?: string | null }; home?: { abbr?: string | null; name?: string | null } }>).map((g) => {
    const eventId = String(g.providerEventId);
    const v = nbaGameLineSummaryView(snap, eventId, published, at, directions);
    const label = `${g.away?.abbr ?? g.away?.name ?? "Away"} @ ${g.home?.abbr ?? g.home?.name ?? "Home"}`;
    return v ? <li key={eventId} data-prop-line-game={eventId}><PropLineSummary view={v} display={display} href={hrefOf(eventId)} label={label} /></li> : null;
  }).filter(Boolean);
  return (
    <PropLineComparison view={view} display={display} id={id} withoutLine={withoutLine} notes={notes} heading="Model vs. sportsbook line · NBA player props">
      {games.length ? <ul data-prop-line-games="" className="m-0 flex flex-col gap-1" style={{ listStyle: "none", paddingLeft: 0 }}>{games}</ul> : null}
    </PropLineComparison>
  );
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
/*
 * THE PER-GAME LINES PAGE (/nba/lines/<eventId>/, page weight 2026-10-30). A game's full per-player table (100–150 rows,
 * each row's HTML repeated in the RSC flight payload) cannot fit a game page's 250 KB budget, so it gets its own page.
 * EXISTENCE RULE (one rule, used by the route's generateStaticParams AND by every link): the display switch is on, and the
 * NEWEST committed lane holding the game (laneHoldingEvent — the lane the game page reads) has a published, decryptable
 * artifact for its date with at least one COMPARED line (nbaGameLineSummaryView non-null — exactly when the compact
 * summary shows). No key (every CI build), another key, or no compared line → no page and no link.
 * WHY A LINK NEVER DANGLES although the rule reads the clock: a comparison freezes at tip-off and only goes STALE as the
 * clock advances before it (lib/sports/nba/line-comparison.mjs compareToLine), so the compared set can only shrink with
 * time. generateStaticParams runs before any page renders (Next "collecting page data" precedes "generating static
 * pages"), so a link decided at render time (later) names a subset of the generated ids.
 */

/** Never a real event id: the inert param the route emits when no lines page exists (a static export may not have an
    empty param list); its page is a 404 and scripts/prune-internal-routes.mjs deletes it and, when nothing else is
    there, the whole out/nba/lines/ directory and its chunks — a keyless build ships no lines route at all. */
export const NBA_LINES_PLACEHOLDER = "nba-lines-none";

type RecordsOf = (date: string) => unknown[] | null;

/** The ids whose /nba/lines/<id>/ page is generated (see the rule above), newest lane first. Reads nothing while the switch
    is off. `lanes` / `recordsOf` are injectable for tests (default: the committed lanes and the published artifacts). */
export function nbaLinesPageIds({ asOf, display = NBA_LINE_DISPLAY, directions = publicDirectionGate("nba"), lanes, recordsOf }: {
  asOf?: string; display?: { public: boolean }; directions?: { scope?: string; shows: (family: string) => boolean };
  lanes?: LaneLike[]; recordsOf?: RecordsOf;
} = {}): string[] {
  if (!display.public) return [];
  const at = asOf || new Date().toISOString();
  const all = (lanes ?? [...committedLaneDates()].sort().reverse().map((d) => loadLaneForDate(d) as LaneLike))
    .filter((l): l is NonNullable<LaneLike> => !!l)
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
  const seen = new Set<string>(), out: string[] = [];
  for (const l of all) {
    const records = l.date ? (recordsOf ? recordsOf(l.date) : nbaPublicLineRecords(l.date)) : null;
    for (const g of l.games) {
      const id = String(g.providerEventId);
      if (seen.has(id)) continue; // an older lane never decides a game the newest lane holds
      seen.add(id);
      if (records && nbaGameLineSummaryView(l, id, records, at, directions)) out.push(id);
    }
  }
  return out;
}

/** One game's lines page href under the same rule (game pages; cheaper than listing every id), else null. */
export function nbaLinesPageHrefFor(eventId: string, asOf?: string, display: { public: boolean } = NBA_LINE_DISPLAY): string | null {
  if (!display.public) return null;
  const snap = laneHoldingEvent(eventId)();
  return snap && nbaGameLineSummaryView(snap, eventId, null, asOf) ? nbaLinesPageHref(eventId) : null;
}

export type { LaneLike };
export { PropLineSummary };
