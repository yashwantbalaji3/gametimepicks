/**
 * SIMULATION THEATER · DEFAULT VIEW (P0-A, founder requirement 2026-10-30) — the OFFICIAL PROJECTED GAME the Theater opens
 * on, before any simulated scenario. Pure: documents in, a display model out; no fs, no clock, no simulation input.
 *
 * "When a user first opens Simulation Theater, its Default mode must correspond directly to the official game and player
 * predictions published elsewhere." So this module computes NOTHING: every number is the game page's own view value
 * (NFL: forecast-view.mjs gameView — the official snapshot through loadForecastView, the accessor /nfl/game/<id> renders)
 * and every string is that page's own formatter (formatValue for players; the hero's one-decimal percent for the win
 * chance; the projected score as published). Official player values are never adjusted to add up to a team score, and
 * a player or family without an official value prints "—" (or is omitted), never a simulated number.
 *
 * NBA's Default view is the server-rendered Official Forecast section (components/nba/official-predictions.tsx,
 * officialStatText) — the game page section itself, moved first.
 *
 * ESTIMATE families (NFL passing and rushing yards while the board marks them ESTIMATE) keep their digits and carry the
 * site's one label (family-publication.mjs estimateLabel, e.g. "Estimate · calibration standard not yet met").
 */
import { MARKET_KEY, PLAYER_FAMILIES, formatValue } from "../sports/nfl/forecast-view.mjs";

/** The game hero's win-chance text (components/nfl/forecast/game-hero.tsx `pct`). */
export const heroPct = (p) => `${(p * 100).toFixed(1)}%`;

/** The five official board families, in the game page's display order. */
export const NFL_DEFAULT_FAMILIES = Object.freeze(PLAYER_FAMILIES.filter((f) => f.source && MARKET_KEY[f.key]));
/** Short column heads (the game page's `short` names). */
export const NFL_DEFAULT_COLUMNS = Object.freeze(NFL_DEFAULT_FAMILIES.map((f) => Object.freeze({ key: f.key, short: f.short, kind: f.kind })));

const POSITION_ORDER = Object.freeze(["QB", "RB", "FB", "WR", "TE"]);
const posRank = (p) => { const i = POSITION_ORDER.indexOf(String(p ?? "").toUpperCase()); return i < 0 ? POSITION_ORDER.length : i; };
const lead = (row) => { for (const f of NFL_DEFAULT_FAMILIES) { const e = row.families[f.key]; if (e && f.kind !== "probability") return e.value; } return 0; };

/**
 * Roster position per ESPN athlete id, from the committed roster artifact (app/public/data/nfl/rosters/latest.json — the
 * same id → position map the per-game player cards group by).
 * Presentation only (row order and the position tag); never a number.
 * @param {any} rosterDoc  the parsed roster artifact (null → empty map)
 */
export function positionsFromRoster(rosterDoc) {
  const m = new Map();
  for (const t of rosterDoc?.teams ?? []) for (const p of t.players ?? []) if (p?.id && p.position?.abbreviation) m.set(String(p.id), p.position.abbreviation);
  return m;
}

/**
 * The NFL Default view model for one game.
 * @param {object|null} view   forecast-view.mjs gameView output (loadForecastView) — null → null
 * @param {{ positions?: Map<string,string>|null }} [opts]  roster positions (positionsFromRoster), for order and tags
 * @returns {null | {
 *   eventId: string, snapshotId: string|null, refusal: string|null,
 *   away: {abbr:string,name:string}, home: {abbr:string,name:string},
 *   winner: {abbr:string,name:string,pct:string,p:number}, winChance: {away:{p:number,text:string}, home:{p:number,text:string}},
 *   projectedScore: {away:number, home:number, text:string} | null,
 *   estimates: Record<string,string>,
 *   teams: Array<{ side:"away"|"home", abbr:string, name:string, columns: typeof NFL_DEFAULT_COLUMNS[number][],
 *     rows: Array<{ playerId:string, name:string, position:string|null, availability:string|null,
 *       cells: Record<string, { value:number, text:string, estimate:string|null } | null> }> }>
 * }}
 */
export function nflOfficialDefault(view, { positions = null } = {}) {
  if (!view) return null;
  const r = view.record;
  const favIsHome = r.favourite === view.home.abbr;
  const fav = favIsHome ? view.home : view.away;
  const favP = favIsHome ? r.winProbability.home : r.winProbability.away;
  const ps = r.projectedScore;
  const projectedScore = ps && Number.isFinite(ps.away) && Number.isFinite(ps.home) ? { away: ps.away, home: ps.home, text: `${view.away.abbr} ${ps.away} – ${ps.home} ${view.home.abbr}` } : null;
  const estimates = Object.fromEntries(Object.entries(view.estimates ?? {}).map(([k, e]) => [k, e.label]));
  const teams = ["away", "home"].map((side) => {
    const t = view[side];
    const rows = (view.players ?? [])
      .filter((p) => p.team === t.abbr)
      .map((p) => ({
        playerId: p.playerId, name: p.name, position: p.position ?? positions?.get(String(p.playerId).replace(/^nfl-athlete-/, "")) ?? null, availability: p.availabilityLabel ?? null,
        families: p.families,
        cells: Object.fromEntries(NFL_DEFAULT_FAMILIES.map((f) => {
          const e = p.families[f.key];
          return [f.key, e ? { value: e.value, text: formatValue(f.kind, e.value), estimate: e.familyState === "ESTIMATE" ? (e.estimateLabel ?? estimates[f.key] ?? null) : null } : null];
        })),
      }))
      .sort((a, b) => posRank(a.position) - posRank(b.position) || lead(b) - lead(a) || String(a.name).localeCompare(String(b.name)))
      .map(({ families, ...row }) => row);
    const columns = NFL_DEFAULT_COLUMNS.filter((c) => rows.some((row) => row.cells[c.key]));
    return { side, abbr: t.abbr, name: t.name, columns, rows };
  });
  return {
    eventId: String(view.providerEventId), snapshotId: view.official?.snapshotId ?? null, refusal: view.official?.refusal ?? null,
    away: view.away, home: view.home,
    winner: { abbr: fav.abbr, name: fav.name, p: favP, pct: heroPct(favP) },
    winChance: { away: { p: r.winProbability.away, text: heroPct(r.winProbability.away) }, home: { p: r.winProbability.home, text: heroPct(r.winProbability.home) } },
    projectedScore,
    estimates,
    teams,
  };
}

/** Section words, shared by the NFL Default component and its tests. */
export const DEFAULT_VIEW_KIND = "Default view · Official projected game · Official Forecast · frozen before kickoff · the same on every page";
export const DEFAULT_VIEW_TITLE = "Official projected game";
export const NFL_DEFAULT_NOTE = "Every figure is the Official Forecast exactly as the game page prints it. Player figures are each player's own official projection (median yards and receptions; touchdown chance), published as is: they are not adjusted to add up to the projected score. “—” means no official projection for that player and statistic.";
export const SCENARIOS_KIND = "Simulated scenario (hypothetical) · not the Official Forecast";
