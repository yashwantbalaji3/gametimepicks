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
  /**
   * S1 (2026-09-30): the participant this read favours, by its EXACT participant name, so the event card
   * can emphasise that side. Set only on a MODEL read — a market price never marks a favourite — and only
   * when the adapter can name the side without guessing.
   */
  favored?: string;
  /**
   * The owner's OWN published probabilities for every outcome, in the card's display order (NFL away/home,
   * soccer home/draw/away), drawn as a split bar. Never derived: no `1 − p` complement is invented, and a
   * sport whose owner publishes one side only leaves this absent.
   */
  split?: Array<{ label: string; p: number }>;
}

/** A read's split bar is drawable only when every share is a real probability. */
export function drawableSplit(read: HubRead | null | undefined): Array<{ label: string; p: number }> | null {
  const s = read?.split;
  if (!Array.isArray(s) || s.length < 2) return null;
  if (!s.every((x) => typeof x?.label === "string" && x.label && Number.isFinite(x.p) && x.p >= 0 && x.p <= 1)) return null;
  const total = s.reduce((a, x) => a + x.p, 0);
  return total > 0 && total <= 1.0001 ? s : null;
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
  /**
   * Phase A (2026-09-29): who is playing, in the order the matchup reads ("PHI @ ATL", "Arsenal v Leeds",
   * "Silva vs Wang"), so the event card can show crests and names instead of one text cell. Identity only —
   * never a claim about the event. Absent when the adapter cannot state both sides; the card then shows the
   * matchup text as before.
   */
  participants?: HubParticipant[];
  /** How the matchup joins its sides: "@" (away at home), "v" (soccer, home first), "vs" (UFC). */
  separator?: "@" | "v" | "vs";
}

export interface HubParticipant {
  name: string;
  /** Team identifier the shared TeamLogo resolves (abbreviation or club name); null ⇒ initials (fighters). */
  logoTeam?: string | null;
  logoSport?: "mlb" | "nfl" | "soccer" | "nba" | null;
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
  /** #797 PR C · replaces the empty state's "0 scheduled" counts line when the sport's schedule owner
   *  knows of games the board does not carry yet (MLB before its morning board). */
  emptyCounts?: string;
  /** Where the empty state sends the reader when the games exist elsewhere on the site. */
  emptyLink?: { href: string; label: string };
  /** P250 · A05 — internal identity reconciliation for adapters that union two sources: schedule
   *  rows that could not state a canonical identity, and rows deferred to the next period's own
   *  surface. Counted, never silently dropped; not rendered to readers. */
  identityReconciliation?: { unidentifiedScheduleRows: number; laterPeriodRows: number };
}

/** A started row whose schedule owner states the game is in play right now (never inferred from the clock). */
export function isInProgress(r: HubGameRow): boolean {
  return r.started && String(r.status).toLowerCase() === "in progress";
}

/**
 * Founder UX decision 2026-10-08 — LIVE FIRST: rows the schedule owner states are in progress lead (earliest start
 * first), then pre-event rows by start time, then the rest of the started/settled rows, most recent first. Live and
 * pre-event rows are still separate groups, so an outcome is never sorted in among forecasts.
 */
export function orderRows(rows: HubGameRow[]): HubGameRow[] {
  const t = (r: HubGameRow) => (r.startUtc ? Date.parse(r.startUtc) : Number.MAX_SAFE_INTEGER);
  const live = rows.filter(isInProgress).sort((a, b) => t(a) - t(b));
  const upcoming = rows.filter((r) => !r.started).sort((a, b) => t(a) - t(b));
  const done = rows.filter((r) => r.started && !isInProgress(r)).sort((a, b) => t(b) - t(a));
  return [...live, ...upcoming, ...done];
}

/** Counts a reader can check against the rows in front of them. Scheduled and reportable are
 *  DIFFERENT numbers, and conflating them is how a page comes to claim every game is simulated. */
export function hubCounts(rows: HubGameRow[]): { scheduled: number; withReport: number; withRead: number; started: number } {
  return {
    /* NOT-YET-STARTED, because that is what the word means and what sits beside it. This counted
       every row, so a UFC card whose thirteen bouts had all begun printed "13 scheduled · 13
       started or final" — twenty-six on a thirteen-bout card, and the comment above promises counts
       a reader can check against the rows in front of them. */
    scheduled: rows.filter((r) => !r.started).length,
    withReport: rows.filter((r) => r.reportState !== "NONE").length,
    withRead: rows.filter((r) => r.read !== null).length,
    started: rows.filter((r) => r.started).length,
  };
}

/**
 * Session 5 · B8 — ONE set of event-status words on every hub card. MLB printed its raw market phase ("pregame",
 * "started", "unknown"), NFL its read-model state ("in progress", "postponed"), EPL/UFC the shared default
 * ("scheduled", "started or final"). The words below are the ones the shared card already used; a source that
 * only knows the game began (not whether it ended) says exactly that, never "live" or "final".
 */
export type HubStatusInput = "SCHEDULED" | "PREGAME" | "IN_PROGRESS" | "FINAL" | "POSTPONED" | "STARTED" | "UNKNOWN";
export function hubStatusWord(state: HubStatusInput | string | null | undefined, startedByClock: boolean): string {
  switch (String(state ?? "").toUpperCase()) {
    case "SCHEDULED": case "PREGAME": return "scheduled";
    case "IN_PROGRESS": return "in progress";
    case "FINAL": return "final";
    case "POSTPONED": return "postponed";
    case "STARTED": return "started or final";
    default: return startedByClock ? "started or final" : "scheduled";
  }
}
