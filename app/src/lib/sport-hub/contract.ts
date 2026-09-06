/**
 * ONE SHAPE FOR EVERY SPORT PAGE.
 *
 * /mlb, /nfl, /epl and /ufc grew independently and read as four different products. NFL opens with
 * its slate and then runs thirteen sections — coverage, player families, participation, audit,
 * differentiation, product receipts — before a visitor reaches anything they can act on. EPL leads
 * with an overview, MLB with an unnamed slate block, UFC with a card. Section ids share no
 * vocabulary (`nfl-reports`, `epl-fixtures`, `mlb-overview`, `ufc-card`), so nothing can navigate
 * them the same way and a reader who learns one page learns nothing about the next.
 *
 * The order below is fixed for all four, and it puts the events first because that is what someone
 * arrives wanting: which games are on, what we think, and where to read it.
 *
 * WHAT THIS IS NOT. It is not a claim that the four sports are equivalent. UFC has bouts on a card,
 * not games on a date; EPL has a matchweek; MLB has a day; NFL has a week. Each adapter says what its
 * sport actually offers, including "no report exists for this event", and the shell renders that
 * honestly rather than padding a section to keep the layouts symmetrical.
 */

export const HUB_SECTIONS = ["games", "products", "simulations", "picks", "results"] as const;
export type HubSectionId = (typeof HUB_SECTIONS)[number];

/** Per-sport vocabulary. Only the noun changes; the position and behaviour do not. */
export interface HubSectionLabels {
  games: string;        // "Games" | "Fixtures" | "Bouts"
  products: string;
  simulations: string;
  picks: string;
  results: string;
}

export const DEFAULT_LABELS: HubSectionLabels = {
  games: "Games", products: "Products", simulations: "Simulations", picks: "Model picks", results: "Results",
};

/**
 * Whether a row leads anywhere, stated as a state rather than a nullable href, so a page cannot
 * accidentally render a dead link and cannot silently drop an event that has no report.
 */
export type ReportState =
  | "READY"      // a report exists for this event now
  | "ARCHIVE"    // the event has been played; the report is a record, not a forecast
  | "NONE";      // no report — the row still shows, with the reason

export interface HubRead {
  /** Short, plain: "Yankees favoured", "Over 2.5 goals", "Decision likely". */
  label: string;
  /** What kind of claim this is. A market price and a model forecast must never read alike. */
  kind: "MODEL_FORECAST" | "MODEL_PICK" | "MARKET_PRICE" | "BASELINE_ONLY";
  /** Optional qualifier shown beside it — sample size, "baseline only", "market-derived". */
  detail?: string;
}

export interface HubGameRow {
  id: string;
  /** ISO start. Null only when a sport genuinely has no scheduled time yet (an unscheduled bout). */
  startUtc: string | null;
  /** Pre-rendered ET label — the server owns the timezone so the row is stable in a static export. */
  startLabel: string;
  matchup: string;
  /** Free-text status straight from the schedule contract: scheduled, in progress, final, postponed. */
  status: string;
  /** Has the event begun? Started and settled rows are grouped apart from pre-event ones, so an
   *  outcome can never be mixed into a row a reader takes as a forecast. */
  started: boolean;
  /** The strongest supported read, or null when the sport has none for this event. */
  read: HubRead | null;
  reportState: ReportState;
  reportHref: string | null;
  /** Why there is no report, when there is none. Shown in place of the action. */
  reportNote?: string;
}

export interface SportHubModel {
  sport: string;
  sportLabel: string;
  labels: HubSectionLabels;
  /** "Week 1", "Matchweek 4", "Saturday 6 September", "UFC 999". */
  periodLabel: string;
  /** The explicit date range the period covers, so a week is never mistaken for a day. */
  periodRange: string | null;
  /** Real freshness of the artifact behind the rows — never a build-time clock. */
  freshness: string | null;
  rows: HubGameRow[];
  /** Sections this sport actually has content for. A section with nothing to show is omitted from
   *  the navigation rather than anchoring to an empty block. */
  present: HubSectionId[];
  /** Shown when `rows` is empty — a no-event period must still route somewhere useful. */
  emptyReason?: string;
}

/** Pre-event rows sorted by start time; started/settled rows after them, most recent first. */
export function orderRows(rows: HubGameRow[]): HubGameRow[] {
  const t = (r: HubGameRow) => (r.startUtc ? Date.parse(r.startUtc) : Number.MAX_SAFE_INTEGER);
  const upcoming = rows.filter((r) => !r.started).sort((a, b) => t(a) - t(b));
  const done = rows.filter((r) => r.started).sort((a, b) => t(b) - t(a));
  return [...upcoming, ...done];
}

/** Counts a reader can check against the rows in front of them. Scheduled and reportable are
 *  DIFFERENT numbers, and conflating them is how a page comes to claim every game is simulated. */
export function hubCounts(rows: HubGameRow[]): { scheduled: number; withReport: number; withRead: number; started: number } {
  return {
    scheduled: rows.length,
    withReport: rows.filter((r) => r.reportState !== "NONE").length,
    withRead: rows.filter((r) => r.read !== null).length,
    started: rows.filter((r) => r.started).length,
  };
}
