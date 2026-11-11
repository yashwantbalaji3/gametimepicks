/**
 * SHARED TRENDS — THE ADAPTER CONTRACT (trends-shared, 2026-11-11). TYPES ONLY: no I/O, no imports, safe for client code.
 *
 * One Trends page for every sport: a sport ADAPTER (server only, build time) turns its own sources into a TrendsModel —
 *   players       tonight's/this week's players from the sport's one official projection
 *   eligibility   eligibility@1 (lib/availability/eligibility.mjs) — the only availability source; only a featurable
 *                 ELIGIBLE player (plus any sport rule, e.g. NFL R5 for a QB) is ranked; UNKNOWN never is
 *   projections   the MODEL PROJECTION reference per stat (NBA: the lane's median; NFL: the receipt of record's median)
 *   game logs     the player's measured past games, newest first (history, never a probability)
 *   line gate     an optional hook that returns lines ONLY through the sport's display + direction authorization;
 *                 lines are written into page HTML only, never into the drawer file
 * — and the shared components (components/trends/*) render it. The sport supplies its words through a TrendsSpec.
 */

export type TrendsAvailability = "eligible" | "not-verified" | "ineligible";

/** One past game as the panel lists it. `values` are keyed by the spec's stat keys. */
export type TrendsGame = { eventId: string; dateEt: string; team: string; opp: string; home: boolean; minutes?: number | null } & Record<string, unknown>;

export type TrendsWindow = { size: number; played: number; above: Record<string, number> | null };

/** An authorized captured line and the history against it — no price, book or odds field exists. */
export type TrendsLine = { stat: string; line: number; capturedAt: string; hits: { size: number; played: number; hit: number }[] };

export type TrendsRow = {
  playerId: string; name: string; team: string; opp: string;
  /** tonight: true = at home ("vs"), false = away ("@") */
  home: boolean;
  availability: TrendsAvailability; availabilityNote: string;
  /** the MODEL PROJECTION per stat; null when none is published (or a sport rule withholds it) */
  reference: Record<string, number> | null;
  windows: TrendsWindow[];
  games: TrendsGame[];
  /** 1-based, ranked players only (the sport's order: NBA expected minutes, NFL projected attempts) */
  rank: number | null;
  position: string | null;
  lines: TrendsLine[];
  /** NBA-MIN-01; false elsewhere */
  minutesUnderReview: boolean;
  /** the eligibility@1 record the availability came from (lib/availability/eligibility.mjs eligibilityRecord) */
  eligibility?: { state: string; reasons: string[]; flags?: string[]; contractVersion: string; sources: unknown };
};

export type TrendsModel = { slateDate: string | null; slateIsToday: boolean; gamesRead: number; rows: TrendsRow[] };

/** What the client filter bar needs (serializable). */
export type TrendsFilterSpec = {
  stats: readonly (readonly [string, string])[];
  /** the default order's name ("Expected minutes", "Projected attempts") */
  orderLabel: string;
  /** NFL: the "5 of 5 / 4+ of 5 / 3+ of 5" filter over the chosen stat's threshold (rows carry data-h5-<stat>) */
  hitFilter: boolean;
};

/** What the client panel needs (serializable). */
export type TrendsPanelSpec = {
  dataUrl: string;
  sport: "nba" | "nfl";
  stats: readonly (readonly [string, string])[];
  windows: readonly number[];
  defaultWindow: number;
  /** NBA logs carry minutes; NFL does not */
  logMinutes: boolean;
  /** the reference's name in the panel ("median", "model threshold, not a sportsbook line") */
  referenceNote: string;
  digits: number;
};

/**
 * A settled game's record for one player (NFL QB, lib/sports/nfl/qb-results.ts): the frozen pregame MODEL PROJECTION, the
 * FINAL · settled actual, and the grade row once it exists, under the "graded against" line — or the HOLD text.
 */
export type TrendsResultMarket = { market: string; label: string; projection: number | null; actual: number | null; grade: { state: "GRADED"; window: string } | null; status: string; verdict: string | null };
export type TrendsResult = {
  eventId: string; kickoffUtc: string; state: "GRADED" | "AWAITING_FINAL" | "HOLD" | "LEGACY" | "NOT_GRADED";
  gradedAgainst: string | null; holdText: string | null;
  qb: { playerId: string; name: string; team: string; opp: string; home: boolean; projectedAt: string; final: boolean; markets: TrendsResultMarket[] };
};

/** One settled game's record for every projected QB (the NFL game page). */
export type TrendsGameResult = Omit<TrendsResult, "qb"> & { qbs: TrendsResult["qb"][] };

/** The drawer file: per player, the reference and the games. Never a line, a price or odds. */
export type TrendsPanelPlayer = {
  name: string; team: string; opp: string; home: boolean; availability: TrendsAvailability; availabilityNote: string;
  minutesUnderReview: boolean; position: string | null; expectedMinutes: number | null; rank: number | null;
  reference: Record<string, number> | null; games: TrendsGame[];
  /** NFL QB: settled games with a frozen projection (newest first) */
  results?: TrendsResult[];
};
export type TrendsPanelPayload = { schema: string; slateDate: string | null; reference: string; note: string; players: Record<string, TrendsPanelPlayer> };
