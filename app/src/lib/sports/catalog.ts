/**
 * THE SPORT CATALOG — the one list of sports and the competitions inside them (UX-001 phase 2, 2026-10-09).
 *
 * Founder naming decision: a reader picks a SPORT (Football, Basketball, Baseball, Soccer, MMA) and then, where a
 * sport has more than one, a competition inside it (Soccer → Premier League, Ligue 1). Every surface that lists sports
 * reads this list: the navigation registry's Sports group (rail, footer, phone Menu), the shared sport switcher on
 * every hub, and the /sports chooser. Before it, five surfaces each kept their own list and none was complete — Ligue 1
 * had a public page no menu linked, the chooser had no NBA.
 *
 * A competition is listed only when it has a public page. Soccer competitions beyond the Premier League come from the
 * league registry's publishing gate (soccerLeaguePages: a registered /soccer/<key> route AND a LIVE or ACCEPTED_V1
 * stage), so a planned, held or rejected league never gets a menu entry — and never a placeholder forecast.
 *
 * Entries are written href, label, note, key — the shape the navigation guards read in source (legacy-route-hiding,
 * product-reset-phase-a), so moving the hubs here kept every one of those assertions unchanged.
 *
 * `note` is the competition's coverage, in the words its own page uses; it never claims a season is on or that a
 * sport is live (a static list cannot keep that true — nav-clarity.test.mjs).
 *
 * Pure: no fs, safe in client components.
 */
import { soccerLeaguePages } from "./soccer/leagues.mjs";

export type SportKey = "football" | "basketball" | "baseball" | "soccer" | "mma";

export type Competition = {
  /** Stable key, also the hub's identity key where one exists (nfl, nba, mlb, epl, ufc, ligue-1). */
  key: string;
  label: string;
  /** Canonical route, no trailing slash (the navigation registry's convention). */
  href: string;
  /** Coverage, as the page itself states it. */
  note: string;
};

export type Sport = {
  key: SportKey;
  label: string;
  glyph: string;
  competitions: readonly Competition[];
};

export const SPORTS: readonly Sport[] = [
  { key: "football", label: "Football", glyph: "🏈",
    competitions: [{ href: "/nfl", label: "NFL", note: "experimental sims", key: "nfl" }] },
  /* Session 6 (founder decision 3): NBA is a factual hub — schedule and official finals, no forecast while every NBA
     model is shadow/withheld. */
  { key: "basketball", label: "Basketball", glyph: "🏀",
    competitions: [{ href: "/nba", label: "NBA", note: "schedule + final scores · no forecast", key: "nba" }] },
  { key: "baseball", label: "Baseball", glyph: "⚾",
    competitions: [{ href: "/mlb", label: "MLB", note: "simulation center", key: "mlb" }] },
  { key: "soccer", label: "Soccer", glyph: "⚽",
    competitions: [
      /* P185/P213: "not validated" is the Premier League's standing limitation, stated once per surface. */
      { href: "/epl", label: "Premier League", note: "forecasts · not validated", key: "epl" },
      /* soccerLeaguePages() only returns leagues whose route is /soccer/<key>. Their note is what Ligue 1's page and the
         capability registry state: model-only forecasts, accepted on a preregistered backtest, too few matches yet to
         grade forward — "backtest only", neither "validated" nor the Premier League's "not validated". */
      ...soccerLeaguePages().map((l) => ({ href: `/soccer/${l.key}`, label: l.name, note: "model-only forecasts · backtest only", key: l.key })),
    ] },
  { key: "mma", label: "MMA", glyph: "🥊",
    competitions: [{ href: "/ufc", label: "UFC", note: "fight card + archive", key: "ufc" }] },
];

/** Every competition with its sport, in catalog order. */
export const COMPETITIONS: readonly (Competition & { sport: Sport })[] =
  SPORTS.flatMap((s) => s.competitions.map((c) => ({ ...c, sport: s })));

/** The sport and competition a hub belongs to, by competition key. */
export function competitionFor(key: string): (Competition & { sport: Sport }) | null {
  return COMPETITIONS.find((c) => c.key === key) ?? null;
}
